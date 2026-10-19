import { Injectable, Logger } from '@nestjs/common';
import type { Grade } from 'ts-fsrs';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { toJson } from '../common/json';
import { SettingsService } from '../settings/settings.service';
import { FsrsService, deserializeCard, serializeCard, serializeLog, stateToStatus, type SerializedCard } from '../fsrs/fsrs.service';
import { CardStatus, Prisma, type CardState, type ReviewLog } from '../generated/prisma/client';
import type { CreateReviewDto } from './reviews.dto';

export interface ReviewResult {
  review: ReviewLog;
  card: CardState;
  reviewRound: number;
  /** true when the request was a retry and the stored result was returned. */
  replayed: boolean;
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly fsrs: FsrsService,
  ) {}

  private async replay(idempotencyKey: string): Promise<ReviewResult | null> {
    const existing = await this.prisma.reviewLog.findUnique({ where: { idempotencyKey } });
    if (!existing) return null;
    const card = await this.prisma.cardState.findUniqueOrThrow({ where: { questionId: existing.questionId } });
    return { review: existing, card, reviewRound: existing.reviewRound, replayed: true };
  }

  async create(dto: CreateReviewDto): Promise<ReviewResult> {
    const prior = await this.replay(dto.idempotencyKey);
    if (prior) return prior;
    const settings = await this.settings.get();
    const params = { requestRetention: settings.requestRetention, maximumInterval: settings.maximumInterval, enableFuzz: settings.enableFuzz };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const question = await tx.question.findFirst({ where: { id: dto.questionId, deletedAt: null }, select: { id: true } });
        if (!question) throw ApiError.notFound('Question', dto.questionId);
        const now = new Date();
        const existingCard = await tx.cardState.findUnique({ where: { questionId: dto.questionId }, select: { questionId: true } });
        if (!existingCard) {
          await tx.cardState.create({
            data: { questionId: dto.questionId, stateJson: toJson(serializeCard(this.fsrs.emptyCard(now))), dueAt: now, status: CardStatus.NEW, version: 0 },
          });
        }
        // Serialize concurrent reviews of the same card (row lock held until commit), then read the locked row.
        await tx.$queryRaw`SELECT questionId FROM CardState WHERE questionId = ${dto.questionId} FOR UPDATE`;
        const card = await tx.cardState.findUniqueOrThrow({ where: { questionId: dto.questionId } });
        if (dto.expectedVersion !== undefined && dto.expectedVersion !== card.version) {
          throw ApiError.conflict('This card was updated by another request. Reload the queue and try again.', { expectedVersion: dto.expectedVersion, currentVersion: card.version });
        }
        const prevCard = deserializeCard(card.stateJson as unknown as SerializedCard);
        const { card: nextCard, log } = this.fsrs.next(params, prevCard, now, dto.rating as Grade);
        const reviewRound = (await tx.reviewLog.count({ where: { questionId: dto.questionId, undone: false, deletedAt: null } })) + 1;
        const review = await tx.reviewLog.create({
          data: {
            questionId: dto.questionId,
            sessionId: dto.sessionId ?? null,
            idempotencyKey: dto.idempotencyKey,
            rating: dto.rating,
            previousStatus: card.status,
            reviewRound,
            reviewedAt: now,
            elapsedMs: dto.elapsedMs ?? 0,
            isCorrect: dto.isCorrect ?? null,
            revealedBeforeAnswer: dto.revealedBeforeAnswer ?? false,
            hintUsed: dto.hintUsed ?? false,
            answerPayloadJson: dto.answerPayload ? toJson(dto.answerPayload) : Prisma.JsonNull,
            previousCardStateJson: card.stateJson as Prisma.InputJsonValue,
            resultingCardStateJson: toJson(serializeCard(nextCard)),
            fsrsLogJson: toJson(serializeLog(log)),
            schedulerVersion: this.fsrs.version,
          },
        });
        const updated = await tx.cardState.updateMany({
          where: { questionId: dto.questionId, version: card.version },
          data: {
            stateJson: toJson(serializeCard(nextCard)),
            dueAt: nextCard.due,
            status: stateToStatus(nextCard.state),
            stability: nextCard.stability,
            difficulty: nextCard.difficulty,
            reps: nextCard.reps,
            lapses: nextCard.lapses,
            lastReviewAt: now,
            version: card.version + 1,
          },
        });
        if (updated.count !== 1) throw ApiError.conflict('Concurrent review detected; nothing was recorded for this request.');
        // Attach the note written during this round (if any) to this review.
        await tx.questionNote.updateMany({ where: { questionId: dto.questionId, reviewRound, reviewLogId: null, deletedAt: null }, data: { reviewLogId: review.id } });
        const fresh = await tx.cardState.findUniqueOrThrow({ where: { questionId: dto.questionId } });
        return { review, card: fresh, reviewRound, replayed: false };
      });
    } catch (e) {
      // Concurrent duplicate with the same idempotency key: return the stored result.
      // Concurrent duplicate (unique idempotencyKey) or a deadlock while the twin request held the row:
      // if the twin already recorded this key, return its result instead of failing.
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        const again = await this.replay(dto.idempotencyKey);
        if (again) return again;
        this.logger.warn(`review write failed (${e.code}): ${e.message}`);
      }
      throw e;
    }
  }

  /** Undo the most recent review of a question: restore the exact previous card snapshot. */
  async undo(reviewId: string) {
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.reviewLog.findUnique({ where: { id: reviewId } });
      if (!review) throw ApiError.notFound('Review', reviewId);
      if (review.undone) throw ApiError.conflict('This review was already undone.');
      const latest = await tx.reviewLog.findFirst({ where: { questionId: review.questionId, undone: false, deletedAt: null }, orderBy: [{ reviewedAt: 'desc' }, { reviewRound: 'desc' }] });
      if (!latest || latest.id !== review.id)
        throw ApiError.conflict('Only the most recent review of a question can be undone.', { latestReviewId: latest?.id ?? null });
      const card = await tx.cardState.findUnique({ where: { questionId: review.questionId } });
      if (!card) throw ApiError.conflict('Card state is missing for this question.');
      const prev = review.previousCardStateJson as unknown as SerializedCard;
      const prevCard = deserializeCard(prev);
      const prevLog = await tx.reviewLog.findFirst({ where: { questionId: review.questionId, undone: false, id: { not: review.id } }, orderBy: { reviewedAt: 'desc' }, select: { reviewedAt: true } });
      const updated = await tx.cardState.updateMany({
        where: { questionId: review.questionId, version: card.version },
        data: {
          stateJson: toJson(prev),
          dueAt: prevCard.due,
          status: stateToStatus(prevCard.state),
          stability: prevCard.stability,
          difficulty: prevCard.difficulty,
          reps: prevCard.reps,
          lapses: prevCard.lapses,
          lastReviewAt: prevLog?.reviewedAt ?? null,
          version: card.version + 1,
        },
      });
      if (updated.count !== 1) throw ApiError.conflict('Concurrent update detected; undo was not applied.');
      const undone = await tx.reviewLog.update({ where: { id: review.id }, data: { undone: true, undoneAt: new Date() } });
      // The note of this round stays with the round (it will be the current round again).
      await tx.questionNote.updateMany({ where: { reviewLogId: review.id }, data: { reviewLogId: null } });
      const fresh = await tx.cardState.findUniqueOrThrow({ where: { questionId: review.questionId } });
      return { review: undone, card: fresh, reviewRound: review.reviewRound };
    });
  }

  async listForQuestion(questionId: string) {
    return this.prisma.reviewLog.findMany({ where: { questionId, deletedAt: null }, orderBy: { reviewedAt: 'desc' }, take: 100 });
  }
}
