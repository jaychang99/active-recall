import { Injectable } from '@nestjs/common';
import type { Question } from '@recall/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';

/**
 * Per-question notes, one per review round.
 * Review round N = the N-th effective (non-undone) review of the question. The "current" round is
 * (effective reviews so far) + 1, i.e. the round the learner is in while studying the card now.
 */
@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async currentRound(questionId: string): Promise<number> {
    return (await this.prisma.reviewLog.count({ where: { questionId, undone: false, deletedAt: null } })) + 1;
  }

  async listForQuestion(questionId: string) {
    const exists = await this.prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
    if (!exists) throw ApiError.notFound('Question', questionId);
    const [currentRound, notes] = await Promise.all([
      this.currentRound(questionId),
      this.prisma.questionNote.findMany({
        where: { questionId, deletedAt: null },
        orderBy: { reviewRound: 'asc' },
        include: { reviewLog: { select: { id: true, rating: true, reviewedAt: true, isCorrect: true, undone: true } } },
      }),
    ]);
    return { questionId, currentRound, notes: notes.map(serializeNote) };
  }

  async upsert(questionId: string, round: number, body: string) {
    const exists = await this.prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
    if (!exists) throw ApiError.notFound('Question', questionId);
    const current = await this.currentRound(questionId);
    if (!Number.isInteger(round) || round < 1 || round > current)
      throw ApiError.badRequest(`reviewRound must be between 1 and the current round (${current})`);
    if (body.trim().length === 0) {
      await this.prisma.questionNote.updateMany({ where: { questionId, reviewRound: round, deletedAt: null }, data: { deletedAt: new Date() } });
      return { questionId, reviewRound: round, deleted: true, currentRound: current };
    }
    // Link to the review log of that round if one exists (round < current).
    const log = await this.prisma.reviewLog.findFirst({ where: { questionId, reviewRound: round, undone: false, deletedAt: null }, select: { id: true } });
    const note = await this.prisma.questionNote.upsert({
      where: { questionId_reviewRound: { questionId, reviewRound: round } },
      create: { questionId, reviewRound: round, body, reviewLogId: log?.id ?? null },
      update: { body, deletedAt: null, ...(log ? { reviewLogId: log.id } : {}) },
      include: { reviewLog: { select: { id: true, rating: true, reviewedAt: true, isCorrect: true, undone: true } } },
    });
    return { ...serializeNote(note), currentRound: current };
  }

  async remove(questionId: string, round: number) {
    const r = await this.prisma.questionNote.updateMany({ where: { questionId, reviewRound: round, deletedAt: null }, data: { deletedAt: new Date() } });
    if (r.count === 0) throw ApiError.notFound('Note');
    return { questionId, reviewRound: round, deleted: true };
  }

  async listForDeck(deckId: string) {
    const deck = await this.prisma.deck.findFirst({ where: { id: deckId, deletedAt: null }, select: { id: true } });
    if (!deck) throw ApiError.notFound('Deck', deckId);
    const notes = await this.prisma.questionNote.findMany({
      where: { question: { deckId, deletedAt: null }, deletedAt: null },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        question: { select: { id: true, externalId: true, type: true, payloadJson: true } },
        reviewLog: { select: { id: true, rating: true, reviewedAt: true, isCorrect: true, undone: true } },
      },
    });
    return notes.map((n) => ({
      ...serializeNote(n),
      question: { id: n.question.id, externalId: n.question.externalId, type: n.question.type, prompt: (n.question.payloadJson as unknown as Question).prompt },
    }));
  }
}

function serializeNote(n: {
  id: string;
  questionId: string;
  reviewRound: number;
  reviewLogId: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  reviewLog?: { id: string; rating: number; reviewedAt: Date; isCorrect: boolean | null; undone: boolean } | null;
}) {
  return {
    id: n.id,
    questionId: n.questionId,
    reviewRound: n.reviewRound,
    reviewLogId: n.reviewLogId,
    body: n.body,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    review: n.reviewLog ? { id: n.reviewLog.id, rating: n.reviewLog.rating, reviewedAt: n.reviewLog.reviewedAt, isCorrect: n.reviewLog.isCorrect, undone: n.reviewLog.undone } : null,
  };
}
