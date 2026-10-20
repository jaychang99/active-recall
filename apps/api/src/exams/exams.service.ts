import { Injectable } from '@nestjs/common';
import { gradeAnswer, toPublicQuestion, type AnswerPayload, type Question } from '@recall/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { toJson } from '../common/json';
import { answerKeyOf } from '../questions/questions.service';
import { Prisma } from '../generated/prisma/client';
import type { CreateExamDto, SubmitExamDto } from './exams.dto';

export interface ExamScore {
  objectiveTotal: number;
  objectiveCorrect: number;
  objectiveAccuracy: number | null; // correct / objectiveTotal (essays excluded)
  essayTotal: number;
  essaySelfScore: number;
  essayMaxScore: number;
  byType: Record<string, { total: number; correct: number }>;
  answered: number;
  durationSec: number | null;
}

@Injectable()
export class ExamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateExamDto) {
    const deck = await this.prisma.deck.findFirst({ where: { id: dto.deckId, userId, deletedAt: null }, select: { id: true, title: true } });
    if (!deck) throw ApiError.notFound('Deck', dto.deckId);
    let pool = await this.prisma.question.findMany({
      where: { userId, deckId: dto.deckId, deletedAt: null, ...(dto.types?.length ? { type: { in: dto.types } } : {}) },
      orderBy: { sortIndex: 'asc' },
      select: { id: true, payloadJson: true, type: true },
    });
    pool = pool.filter((r) => {
      const q = r.payloadJson as unknown as Question;
      if (dto.tags?.length && !dto.tags.some((t) => q.tags.includes(t))) return false;
      if (dto.difficultyMin !== undefined && q.difficulty < dto.difficultyMin) return false;
      if (dto.difficultyMax !== undefined && q.difficulty > dto.difficultyMax) return false;
      return true;
    });
    if (dto.retryOfAttemptId) {
      const wrong = await this.prisma.examResponse.findMany({ where: { userId, attemptId: dto.retryOfAttemptId, deletedAt: null, OR: [{ isCorrect: false }, { isCorrect: null, answerPayloadJson: { equals: Prisma.DbNull } }] }, select: { questionId: true } });
      const ids = new Set(wrong.map((w) => w.questionId));
      pool = pool.filter((r) => ids.has(r.id));
    }
    if (pool.length === 0) throw ApiError.badRequest('No questions match the exam filters.');
    if (dto.shuffle ?? true) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
      }
    }
    const chosen = pool.slice(0, dto.count ?? pool.length);
    const attempt = await this.prisma.examAttempt.create({
      data: {
        userId,
        deckId: dto.deckId,
        title: dto.title ?? `${deck.title} 시험`,
        configJson: toJson({ count: chosen.length, shuffle: dto.shuffle ?? true, tags: dto.tags ?? [], types: dto.types ?? [], difficultyMin: dto.difficultyMin, difficultyMax: dto.difficultyMax, timeLimitSec: dto.timeLimitSec ?? null, retryOfAttemptId: dto.retryOfAttemptId ?? null }),
        questionIds: toJson(chosen.map((c) => c.id)),
      },
    });
    return this.get(userId, attempt.id);
  }

  async get(userId: string, id: string) {
    const attempt = await this.prisma.examAttempt.findFirst({ where: { id, userId, deletedAt: null }, include: { deck: { select: { id: true, title: true, subject: true } }, responses: { where: { deletedAt: null } } } });
    if (!attempt) throw ApiError.notFound('Exam attempt', id);
    const ids = attempt.questionIds as string[];
    const rows = await this.prisma.question.findMany({ where: { userId, id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const submitted = attempt.submittedAt !== null;
    const respById = new Map(attempt.responses.map((r) => [r.questionId, r]));
    const questions = ids.map((qid, index) => {
      const row = byId.get(qid);
      if (!row) return null;
      const q = row.payloadJson as unknown as Question;
      const resp = respById.get(qid);
      return {
        index,
        questionId: row.id,
        externalId: row.externalId,
        type: row.type,
        question: submitted ? q : toPublicQuestion(q),
        ...(submitted
          ? {
              answerKey: answerKeyOf(q),
              explanation: q.explanation,
              response: resp ? { answerPayload: resp.answerPayloadJson, isCorrect: resp.isCorrect, detail: resp.gradeDetailJson, selfScore: resp.selfScore } : null,
            }
          : {}),
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
    return {
      id: attempt.id,
      deck: attempt.deck,
      title: attempt.title,
      config: attempt.configJson,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.scoreJson as ExamScore | null,
      questions,
    };
  }

  async submit(userId: string, id: string, dto: SubmitExamDto) {
    const attempt = await this.prisma.examAttempt.findFirst({ where: { id, userId, deletedAt: null } });
    if (!attempt) throw ApiError.notFound('Exam attempt', id);
    if (attempt.submittedAt) throw ApiError.conflict('This exam was already submitted.');
    const ids = attempt.questionIds as string[];
    const rows = await this.prisma.question.findMany({ where: { userId, id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const respById = new Map(dto.responses.map((r) => [r.questionId, r]));
    const now = new Date();
    const score: ExamScore = { objectiveTotal: 0, objectiveCorrect: 0, objectiveAccuracy: null, essayTotal: 0, essaySelfScore: 0, essayMaxScore: 0, byType: {}, answered: 0, durationSec: Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000) };
    const creates: Prisma.ExamResponseCreateManyInput[] = [];
    for (const qid of ids) {
      const row = byId.get(qid);
      if (!row) continue;
      const q = row.payloadJson as unknown as Question;
      const resp = respById.get(qid);
      const payload: AnswerPayload | null = resp?.answerPayload ?? null;
      const withScores = payload && q.type === 'essay' && resp?.selfScores ? ({ ...payload, selfScores: resp.selfScores } as AnswerPayload) : payload;
      const grade = gradeAnswer(q, withScores);
      if (payload) score.answered++;
      const t = (score.byType[q.type] ??= { total: 0, correct: 0 });
      t.total++;
      if (q.type === 'essay') {
        score.essayTotal++;
        score.essayMaxScore += q.answer.maxScore;
        score.essaySelfScore += grade.detail.selfScore ?? 0;
      } else {
        score.objectiveTotal++;
        if (grade.isCorrect) {
          score.objectiveCorrect++;
          t.correct++;
        }
      }
      creates.push({
        userId,
        attemptId: id,
        questionId: qid,
        answerPayloadJson: withScores ? toJson(withScores) : Prisma.JsonNull,
        isCorrect: grade.isCorrect,
        gradeDetailJson: toJson(grade.detail),
        selfScore: grade.detail.selfScore ?? null,
      });
    }
    score.objectiveAccuracy = score.objectiveTotal ? score.objectiveCorrect / score.objectiveTotal : null;
    await this.prisma.$transaction([
      this.prisma.examResponse.createMany({ data: creates }),
      this.prisma.examAttempt.update({ where: { id, userId }, data: { submittedAt: now, scoreJson: toJson(score) } }),
    ]);
    return this.get(userId, id);
  }

  async list(userId: string, deckId?: string, limit = 50) {
    const attempts = await this.prisma.examAttempt.findMany({
      where: { userId, deletedAt: null, ...(deckId ? { deckId } : {}) },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { deck: { select: { id: true, title: true, subject: true } } },
    });
    return attempts.map((a) => ({ id: a.id, deck: a.deck, title: a.title, config: a.configJson, startedAt: a.startedAt, submittedAt: a.submittedAt, score: a.scoreJson as ExamScore | null }));
  }

  async remove(userId: string, id: string) {
    const a = await this.prisma.examAttempt.findFirst({ where: { id, userId, deletedAt: null } });
    if (!a) throw ApiError.notFound('Exam attempt', id);
    await this.prisma.examAttempt.update({ where: { id, userId }, data: { deletedAt: new Date() } });
    return { deleted: id };
  }
}
