import { Injectable } from '@nestjs/common';
import { gradeAnswer, toPublicQuestion, type AnswerPayload, type Question } from '@recall/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async load(id: string) {
    const row = await this.prisma.question.findFirst({ where: { id, deletedAt: null }, include: { card: true } });
    if (!row) throw ApiError.notFound('Question', id);
    return row;
  }

  async get(id: string, includeAnswer: boolean) {
    const row = await this.load(id);
    const q = row.payloadJson as unknown as Question;
    return { id: row.id, externalId: row.externalId, deckId: row.deckId, type: row.type, revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt, question: includeAnswer ? q : toPublicQuestion(q), card: row.card };
  }

  /** Authoritative grading. Returns the verdict together with the answer key and explanation. */
  async grade(id: string, payload: AnswerPayload | null) {
    const row = await this.load(id);
    const q = row.payloadJson as unknown as Question;
    const grade = gradeAnswer(q, payload);
    return { questionId: row.id, grade, answerKey: answerKeyOf(q), explanation: q.explanation };
  }

  async answerKey(id: string) {
    const row = await this.load(id);
    const q = row.payloadJson as unknown as Question;
    return { questionId: row.id, answerKey: answerKeyOf(q), explanation: q.explanation };
  }
}

/** The answer-bearing slice of a question, revealed only after submit/reveal. */
export function answerKeyOf(q: Question): Record<string, unknown> {
  switch (q.type) {
    case 'cloze':
      return { type: q.type, blanks: q.blanks };
    default:
      return { type: q.type, answer: q.answer };
  }
}
