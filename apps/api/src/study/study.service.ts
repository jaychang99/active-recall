import { Injectable } from '@nestjs/common';
import { gradeAnswer, toPublicQuestion, type AnswerPayload, type Question } from '@recall/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { toJson } from '../common/json';
import { SettingsService } from '../settings/settings.service';
import { FsrsService, deserializeCard, type SerializedCard } from '../fsrs/fsrs.service';
import { endOfDayInTz, startOfDayInTz } from '../common/time';
import { CardStatus, Prisma, SessionMode, type QuestionType } from '../generated/prisma/client';

export type StudyMode = 'scheduled' | 'cram' | 'mistakes' | 'flagged' | 'practice';

export interface QueueOptions {
  /** deck id, or "all" for every deck (optionally narrowed by `subject`). */
  scope: string;
  subject?: string;
  mode: StudyMode;
  tags?: string[];
  types?: QuestionType[];
  difficultyMin?: number;
  difficultyMax?: number;
  limit: number;
  /** cram/practice: shuffle the queue */
  shuffle?: boolean;
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

@Injectable()
export class StudyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly fsrs: FsrsService,
  ) {}

  private deckWhere(opts: QueueOptions): Prisma.QuestionWhereInput {
    const subject: Prisma.QuestionWhereInput = opts.subject ? { subjects: { some: { deletedAt: null, subject: { name: opts.subject, deletedAt: null } } } } : {};
    if (opts.scope === 'all') return { deletedAt: null, deck: { deletedAt: null }, ...subject };
    return { deletedAt: null, deckId: opts.scope, deck: { deletedAt: null }, ...subject };
  }

  async queue(opts: QueueOptions) {
    let deck: { id: string; title: string } | null = null;
    if (opts.scope !== 'all') {
      deck = await this.prisma.deck.findFirst({ where: { id: opts.scope, deletedAt: null }, select: { id: true, title: true } });
      if (!deck) throw ApiError.notFound('Deck', opts.scope);
    }
    const settings = await this.settings.get();
    const params = { requestRetention: settings.requestRetention, maximumInterval: settings.maximumInterval, enableFuzz: settings.enableFuzz };
    const now = new Date();
    const dayStart = startOfDayInTz(now, settings.timezone);
    const dayEnd = endOfDayInTz(now, settings.timezone);
    const qWhere = this.deckWhere(opts);

    const todayLogs = await this.prisma.reviewLog.findMany({
      where: { undone: false, deletedAt: null, reviewedAt: { gte: dayStart, lt: dayEnd }, question: qWhere },
      select: { questionId: true, previousStatus: true },
    });
    const reviewedToday = new Set(todayLogs.map((l) => l.questionId)).size;
    const newIntroducedToday = new Set(todayLogs.filter((l) => l.previousStatus === CardStatus.NEW).map((l) => l.questionId)).size;
    const reviewsDoneToday = new Set(todayLogs.filter((l) => l.previousStatus === CardStatus.REVIEW).map((l) => l.questionId)).size;

    const all = await this.prisma.question.findMany({
      where: { ...qWhere, ...(opts.types?.length ? { type: { in: opts.types } } : {}) },
      orderBy: [{ deckId: 'asc' }, { sortIndex: 'asc' }],
      include: { card: true, deck: { select: { id: true, title: true, subject: true } }, _count: { select: { notes: { where: { deletedAt: null } }, reviews: { where: { undone: false, deletedAt: null } } } } },
    });
    // content filters (JSON payload)
    const rows = all.filter((r) => {
      const q = r.payloadJson as unknown as Question;
      if (opts.tags?.length && !opts.tags.some((t) => q.tags.includes(t))) return false;
      if (opts.difficultyMin !== undefined && q.difficulty < opts.difficultyMin) return false;
      if (opts.difficultyMax !== undefined && q.difficulty > opts.difficultyMax) return false;
      return true;
    });
    const eligible = rows.filter((r) => !r.card?.suspended && !(r.card?.buriedUntil && r.card.buriedUntil > now));

    let ordered: typeof rows;
    const learning = eligible
      .filter((r) => r.card && (r.card.status === CardStatus.LEARNING || r.card.status === CardStatus.RELEARNING) && r.card.dueAt <= now)
      .sort((a, b) => a.card!.dueAt.getTime() - b.card!.dueAt.getTime());
    const reviewDue = eligible
      .filter((r) => r.card && r.card.status === CardStatus.REVIEW && r.card.dueAt <= dayEnd)
      .sort((a, b) => a.card!.dueAt.getTime() - b.card!.dueAt.getTime());
    const fresh = eligible.filter((r) => !r.card || r.card.status === CardStatus.NEW);
    const reviewBudget = Math.max(0, settings.reviewsPerDay - reviewsDoneToday);
    const newBudget = Math.max(0, settings.newCardsPerDay - newIntroducedToday);
    const seed = Math.floor(now.getTime() / 60_000);

    switch (opts.mode) {
      case 'scheduled': {
        const newOrdered = settings.newCardOrder === 'random' ? seededShuffle(fresh, seed) : fresh;
        ordered = [...learning, ...reviewDue.slice(0, reviewBudget), ...newOrdered.slice(0, newBudget)];
        break;
      }
      case 'cram':
      case 'practice':
        ordered = opts.shuffle === false ? eligible : seededShuffle(eligible, seed);
        break;
      case 'mistakes': {
        // questions whose most recent effective review (or practice/exam answer) was incorrect, plus lapses
        const last = await this.prisma.reviewLog.findMany({
          where: { undone: false, deletedAt: null, question: qWhere },
          orderBy: { reviewedAt: 'desc' },
          select: { questionId: true, isCorrect: true, rating: true },
          distinct: ['questionId'],
        });
        const wrong = new Set(last.filter((l) => l.isCorrect === false || l.rating === 1).map((l) => l.questionId));
        const exam = await this.prisma.examResponse.findMany({ where: { isCorrect: false, deletedAt: null, question: qWhere }, select: { questionId: true } });
        for (const e of exam) wrong.add(e.questionId);
        ordered = eligible.filter((r) => wrong.has(r.id) || (r.card?.lapses ?? 0) > 0).sort((a, b) => (b.card?.lapses ?? 0) - (a.card?.lapses ?? 0));
        break;
      }
      case 'flagged':
        ordered = eligible.filter((r) => r.card?.flagged);
        break;
    }
    ordered = ordered.slice(0, opts.limit);

    const learningLater = eligible
      .filter((r) => r.card && (r.card.status === CardStatus.LEARNING || r.card.status === CardStatus.RELEARNING) && r.card.dueAt > now)
      .map((r) => r.card!.dueAt.getTime());
    const nextLearningDueAt = learningLater.length ? new Date(Math.min(...learningLater)) : null;

    const items = ordered.map((r) => {
      const q = r.payloadJson as unknown as Question;
      const card = r.card ? deserializeCard(r.card.stateJson as unknown as SerializedCard) : this.fsrs.emptyCard(now);
      return {
        questionId: r.id,
        externalId: r.externalId,
        deck: r.deck,
        type: r.type,
        question: toPublicQuestion(q),
        hasHint: !!q.hint,
        card: {
          status: r.card?.status ?? CardStatus.NEW,
          dueAt: r.card?.dueAt ?? now,
          version: r.card?.version ?? 0,
          reps: r.card?.reps ?? 0,
          lapses: r.card?.lapses ?? 0,
          stability: r.card?.stability ?? 0,
          difficulty: r.card?.difficulty ?? 0,
          flagged: r.card?.flagged ?? false,
          suspended: r.card?.suspended ?? false,
          lastReviewAt: r.card?.lastReviewAt ?? null,
          retrievability: this.fsrs.retrievability(params, card, now),
        },
        reviewRound: r._count.reviews + 1,
        noteCount: r._count.notes,
        preview: settings.showIntervalPreview && opts.mode !== 'practice' ? this.fsrs.preview(params, card, now) : null,
      };
    });

    return {
      scope: opts.scope,
      subject: opts.subject ?? null,
      mode: opts.mode,
      deck,
      generatedAt: now.toISOString(),
      timezone: settings.timezone,
      settings: { shuffleChoices: settings.shuffleChoices, autoAdvanceAfterRating: settings.autoAdvanceAfterRating, shortcutsEnabled: settings.shortcutsEnabled, dailyReviewGoal: settings.dailyReviewGoal },
      counts: {
        learningDue: learning.length,
        reviewDue: reviewDue.length,
        reviewBudget,
        newAvailable: fresh.length,
        newBudget,
        reviewedToday,
        newIntroducedToday,
        total: rows.length,
        eligible: eligible.length,
        suspended: rows.filter((r) => r.card?.suspended).length,
        buried: rows.filter((r) => r.card?.buriedUntil && r.card.buriedUntil > now).length,
        queued: items.length,
      },
      nextLearningDueAt,
      items,
    };
  }

  async hint(questionId: string) {
    const row = await this.prisma.question.findFirst({ where: { id: questionId, deletedAt: null }, select: { payloadJson: true } });
    if (!row) throw ApiError.notFound('Question', questionId);
    return { questionId, hint: (row.payloadJson as unknown as Question).hint ?? null };
  }

  async startSession(dto: { scope: string; mode: StudyMode; queueSize: number; subject?: string }) {
    const isDeck = dto.scope !== 'all';
    if (isDeck) {
      const deck = await this.prisma.deck.findFirst({ where: { id: dto.scope, deletedAt: null }, select: { id: true } });
      if (!deck) throw ApiError.notFound('Deck', dto.scope);
    }
    const mode: SessionMode = dto.mode === 'practice' ? SessionMode.practice : dto.mode === 'scheduled' ? SessionMode.study : SessionMode.cram;
    return this.prisma.studySession.create({
      data: { deckId: isDeck ? dto.scope : null, scope: isDeck ? 'deck' : dto.subject ? `subject:${dto.subject}` : 'all', mode, queueSize: dto.queueSize },
    });
  }

  async endSession(id: string) {
    const s = await this.prisma.studySession.findFirst({ where: { id, deletedAt: null } });
    if (!s) throw ApiError.notFound('Session', id);
    const [reviews, practices] = await Promise.all([
      this.prisma.reviewLog.count({ where: { sessionId: id, undone: false, deletedAt: null } }),
      this.prisma.practiceLog.count({ where: { sessionId: id, deletedAt: null } }),
    ]);
    const ended = await this.prisma.studySession.update({ where: { id }, data: { endedAt: s.endedAt ?? new Date() } });
    return { ...ended, reviews, practices };
  }

  /** Practice mode answer log: graded, stored, never touches FSRS. */
  async logPractice(dto: { questionId: string; sessionId?: string; answerPayload?: AnswerPayload | null; elapsedMs?: number }) {
    const row = await this.prisma.question.findFirst({ where: { id: dto.questionId, deletedAt: null } });
    if (!row) throw ApiError.notFound('Question', dto.questionId);
    const grade = gradeAnswer(row.payloadJson as unknown as Question, dto.answerPayload ?? null);
    const log = await this.prisma.practiceLog.create({
      data: {
        questionId: dto.questionId,
        sessionId: dto.sessionId ?? null,
        isCorrect: grade.isCorrect,
        answerPayloadJson: dto.answerPayload ? toJson(dto.answerPayload) : Prisma.JsonNull,
        elapsedMs: dto.elapsedMs ?? 0,
      },
    });
    return { log, grade };
  }

  async recentSessions(limit = 20) {
    const sessions = await this.prisma.studySession.findMany({
      where: { deletedAt: null },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { deck: { select: { id: true, title: true, subject: true } }, _count: { select: { reviews: { where: { undone: false } }, practices: true } } },
    });
    return sessions.map((s) => ({ ...s, reviews: s._count.reviews, practices: s._count.practices }));
  }
}
