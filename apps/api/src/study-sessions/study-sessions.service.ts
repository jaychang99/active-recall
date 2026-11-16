import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AnswerPayload } from '@recall/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { toJson } from '../common/json';
import { Prisma, SessionMode, type QuestionType } from '../generated/prisma/client';
import { StudyService, type StudyMode } from '../study/study.service';

/** A session is joinable while it is not ended and was used within this window. */
export const ACTIVE_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface OpenSessionInput {
  scope: string;
  mode: StudyMode;
  subject?: string;
  tags?: string[];
  types?: QuestionType[];
  difficultyMin?: number;
  difficultyMax?: number;
  limit?: number;
  /** End any active session with these parameters and start over. */
  fresh?: boolean;
}

export interface ItemStateInput { answerPayload?: AnswerPayload | null; revealedBeforeAnswer?: boolean; hintUsed?: boolean }

const MODE_OF: Record<StudyMode, SessionMode> = { scheduled: SessionMode.study, new: SessionMode.study, cram: SessionMode.cram, mistakes: SessionMode.cram, flagged: SessionMode.cram, practice: SessionMode.practice, browse: SessionMode.browse };

/** Same study page = same parameters, whatever device opened it. */
export function paramsKey(i: OpenSessionInput): string {
  const canonical = JSON.stringify([i.scope, i.mode, i.subject ?? null, i.tags ?? [], i.types ?? [], i.difficultyMin ?? null, i.difficultyMax ?? null, i.limit ?? null]);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Study sessions shared across reloads, tabs and devices. The queue is frozen into StudySessionItem rows when the
 * session starts; reopening the same study page within the active window joins it instead of building a new queue.
 * Ratings stay in ReviewLog (the one place FSRS state changes): the state endpoint returns the reviews of the
 * session's questions so every device can see which entries are rated, by whom and how.
 */
@Injectable()
export class StudySessionsService {
  constructor(private readonly prisma: PrismaService, private readonly study: StudyService) {}

  private async owned(userId: string, id: string) {
    const s = await this.prisma.studySession.findFirst({ where: { id, userId, deletedAt: null } });
    if (!s) throw ApiError.notFound('Session', id);
    return s;
  }

  private studyMode(mode: SessionMode, fallback: StudyMode = 'cram'): StudyMode {
    return mode === SessionMode.study ? 'scheduled' : mode === SessionMode.practice ? 'practice' : mode === SessionMode.browse ? 'browse' : fallback;
  }

  async open(userId: string, input: OpenSessionInput) {
    const key = paramsKey(input);
    const now = new Date();
    const queueOpts = { scope: input.scope, subject: input.subject, mode: input.mode, tags: input.tags, types: input.types, difficultyMin: input.difficultyMin, difficultyMax: input.difficultyMax, limit: input.limit ?? 100 };
    if (input.fresh) {
      await this.prisma.studySession.updateMany({ where: { userId, paramsKey: key, endedAt: null, deletedAt: null }, data: { endedAt: now } });
    } else {
      const active = await this.prisma.studySession.findFirst({
        where: { userId, paramsKey: key, endedAt: null, deletedAt: null, lastActiveAt: { gte: new Date(now.getTime() - ACTIVE_WINDOW_MS) } },
        orderBy: { lastActiveAt: 'desc' },
      });
      if (active) {
        const state = await this.state(userId, active.id, 0, input.mode);
        // A session restored from a backup has no queue rows: start a new one instead.
        if (state.items.some((i) => !i.skipped)) {
          const { items: _fresh, ...meta } = await this.study.queue(userId, queueOpts);
          await this.prisma.studySession.update({ where: { id: active.id, userId }, data: { lastActiveAt: now } });
          return { resumed: true, queue: meta, ...state };
        }
      }
    }
    const queue = await this.study.queue(userId, queueOpts);
    const isDeck = input.scope !== 'all';
    const session = await this.prisma.studySession.create({
      data: { userId, deckId: isDeck ? input.scope : null, scope: isDeck ? 'deck' : input.subject ? `subject:${input.subject}` : 'all', mode: MODE_OF[input.mode], queueSize: queue.items.length, paramsKey: key, lastActiveAt: now },
    });
    if (queue.items.length) {
      await this.prisma.studySessionItem.createMany({ data: queue.items.map((it, position) => ({ userId, sessionId: session.id, position, questionId: it.questionId, reviewRound: it.reviewRound })) });
    }
    const { items, ...meta } = queue;
    const state = await this.state(userId, session.id, items.length, input.mode);
    return { resumed: false, queue: meta, ...state, newItems: items.map((it, position) => ({ ...it, position })) };
  }

  /**
   * Everything a device needs to merge: every queue entry with its shared state, full content for entries from
   * position `known` on (the ones this device has not loaded yet), the effective reviews of the session's questions
   * since it started, and their current card versions.
   */
  async state(userId: string, sessionId: string, known: number, mode?: StudyMode) {
    const s = await this.owned(userId, sessionId);
    const rows = await this.prisma.studySessionItem.findMany({ where: { userId, sessionId, deletedAt: null }, orderBy: { position: 'asc' } });
    const questionIds = [...new Set(rows.map((r) => r.questionId))];
    const [reviews, cards, newItems] = await Promise.all([
      questionIds.length
        ? this.prisma.reviewLog.findMany({
            where: { userId, questionId: { in: questionIds }, undone: false, deletedAt: null, reviewedAt: { gte: s.startedAt } },
            select: { id: true, questionId: true, reviewRound: true, rating: true, reviewedAt: true, sessionId: true, isCorrect: true },
            orderBy: { reviewedAt: 'asc' },
          })
        : [],
      questionIds.length
        ? this.prisma.cardState.findMany({ where: { userId, questionId: { in: questionIds } }, select: { questionId: true, version: true, status: true, flagged: true, suspended: true, dueAt: true, reps: true, lapses: true } })
        : [],
      this.newItems(userId, rows.filter((r) => r.position >= known), mode ?? this.studyMode(s.mode)),
    ]);
    return {
      session: { id: s.id, mode: s.mode, startedAt: s.startedAt, endedAt: s.endedAt, lastPosition: s.lastPosition, lastActiveAt: s.lastActiveAt },
      items: rows.map((r) => ({ position: r.position, questionId: r.questionId, reviewRound: r.reviewRound, skipped: r.skipped, phase: r.phase, answerPayload: (r.answerPayloadJson as AnswerPayload | null) ?? null, revealedBeforeAnswer: r.revealedBeforeAnswer, hintUsed: r.hintUsed, createdAt: r.createdAt, updatedAt: r.updatedAt })),
      newItems,
      reviews,
      cards,
    };
  }

  private async newItems(userId: string, rows: { position: number; questionId: string; reviewRound: number }[], mode: StudyMode) {
    const items = await this.study.itemsFor(userId, rows, mode);
    const byKey = new Map(items.map((it) => [`${it.questionId}:${it.reviewRound}`, it]));
    return rows.flatMap((r) => { const it = byKey.get(`${r.questionId}:${r.reviewRound}`); return it ? [{ ...it, position: r.position }] : []; });
  }

  /** Where the learner is; moving inside an ended session (back from the summary) reopens it. */
  async setPosition(userId: string, sessionId: string, position: number) {
    await this.owned(userId, sessionId);
    await this.prisma.studySession.update({ where: { id: sessionId, userId }, data: { lastPosition: position, lastActiveAt: new Date(), endedAt: null } });
    return { sessionId, position };
  }

  private async item(userId: string, sessionId: string, position: number) {
    const row = await this.prisma.studySessionItem.findFirst({ where: { userId, sessionId, position, deletedAt: null } });
    if (!row) throw ApiError.notFound('Session item', `${sessionId}#${position}`);
    return row;
  }

  /** The answer was opened (submitted or revealed): share it so other devices show the result too. */
  async setItemState(userId: string, sessionId: string, position: number, input: ItemStateInput) {
    await this.owned(userId, sessionId);
    const row = await this.item(userId, sessionId, position);
    await this.prisma.studySessionItem.update({
      where: { id: row.id, userId },
      data: { phase: 'submitted', answerPayloadJson: input.answerPayload ? toJson(input.answerPayload) : Prisma.JsonNull, revealedBeforeAnswer: !!input.revealedBeforeAnswer, hintUsed: !!input.hintUsed },
    });
    await this.prisma.studySession.update({ where: { id: sessionId, userId }, data: { lastActiveAt: new Date() } });
    return { sessionId, position, phase: 'submitted' };
  }

  async setSkipped(userId: string, sessionId: string, position: number, skipped: boolean) {
    await this.owned(userId, sessionId);
    const row = await this.item(userId, sessionId, position);
    await this.prisma.studySessionItem.update({ where: { id: row.id, userId }, data: { skipped } });
    return { sessionId, position, skipped };
  }

  /**
   * Re-queue a card at the end (Again on a learning step). Idempotent per (question, round): a repeat returns the
   * existing entry, and an entry removed by an undo comes back at the end.
   */
  async append(userId: string, sessionId: string, questionId: string, reviewRound: number) {
    const s = await this.owned(userId, sessionId);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const row = await this.prisma.$transaction(async (tx) => {
          const existing = await tx.studySessionItem.findFirst({ where: { userId, sessionId, questionId, reviewRound } });
          if (existing && !existing.deletedAt) return existing;
          const last = await tx.studySessionItem.findFirst({ where: { userId, sessionId }, orderBy: { position: 'desc' }, select: { position: true } });
          const position = (last?.position ?? -1) + 1;
          if (existing) return tx.studySessionItem.update({ where: { id: existing.id, userId }, data: { deletedAt: null, position, skipped: false, phase: null, answerPayloadJson: Prisma.JsonNull, revealedBeforeAnswer: false, hintUsed: false } });
          return tx.studySessionItem.create({ data: { userId, sessionId, position, questionId, reviewRound } });
        });
        const [item] = await this.newItems(userId, [row], this.studyMode(s.mode));
        if (!item) throw ApiError.notFound('Question', questionId);
        await this.prisma.studySession.update({ where: { id: sessionId, userId }, data: { lastActiveAt: new Date() } });
        return item;
      } catch (e) {
        // Two devices appended at once and took the same position: try the next one.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 3) continue;
        throw e;
      }
    }
    throw ApiError.conflict('Could not append to the session queue.');
  }

  /** Drop a re-queued copy again (its original's rating was undone). Only an entry nobody opened yet. */
  async removeItem(userId: string, sessionId: string, position: number) {
    await this.owned(userId, sessionId);
    const row = await this.item(userId, sessionId, position);
    if (row.phase) throw ApiError.conflict('This entry was already answered on a device and stays in the session.');
    await this.prisma.studySessionItem.update({ where: { id: row.id, userId }, data: { deletedAt: new Date() } });
    return { sessionId, position, removed: true };
  }
}
