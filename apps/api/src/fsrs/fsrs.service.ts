import { Injectable } from '@nestjs/common';
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  FSRSVersion,
  Rating,
  State,
  type Card,
  type Grade,
  type RecordLogItem,
  type ReviewLog as FsrsReviewLog,
} from 'ts-fsrs';
import { CardStatus } from '../generated/prisma/client';

/** JSON-safe form of a ts-fsrs Card (dates as ISO strings). Stored verbatim in CardState.stateJson. */
export interface SerializedCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review?: string | null;
}

export interface SerializedFsrsLog {
  rating: Rating;
  state: State;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  review: string;
}

export interface SchedulerParams {
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
}

export const RATING_LABEL: Record<Grade, 'again' | 'hard' | 'good' | 'easy'> = {
  [Rating.Again]: 'again',
  [Rating.Hard]: 'hard',
  [Rating.Good]: 'good',
  [Rating.Easy]: 'easy',
};

export function serializeCard(card: Card): SerializedCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

export function deserializeCard(s: SerializedCard): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps ?? 0,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  };
}

export function serializeLog(log: FsrsReviewLog): SerializedFsrsLog {
  return { ...log, due: log.due.toISOString(), review: log.review.toISOString() };
}

export function deserializeLog(s: SerializedFsrsLog): FsrsReviewLog {
  return { ...s, due: new Date(s.due), review: new Date(s.review) };
}

export function stateToStatus(state: State): CardStatus {
  switch (state) {
    case State.New:
      return CardStatus.NEW;
    case State.Learning:
      return CardStatus.LEARNING;
    case State.Review:
      return CardStatus.REVIEW;
    case State.Relearning:
      return CardStatus.RELEARNING;
  }
}

/** Compact human interval like "10m", "1d", "3.5mo". */
export function formatInterval(from: Date, to: Date): string {
  const ms = to.getTime() - from.getTime();
  if (ms < 60_000) return '<1m';
  const mins = ms / 60_000;
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30.44;
  if (months < 12) return `${months.toFixed(months < 10 ? 1 : 0)}mo`;
  const years = days / 365.25;
  return `${years.toFixed(years < 10 ? 1 : 0)}y`;
}

@Injectable()
export class FsrsService {
  readonly version = `ts-fsrs ${FSRSVersion}`;

  scheduler(params: SchedulerParams) {
    return fsrs(
      generatorParameters({
        request_retention: params.requestRetention,
        maximum_interval: params.maximumInterval,
        enable_fuzz: params.enableFuzz,
      }),
    );
  }

  emptyCard(now = new Date()): Card {
    return createEmptyCard(now);
  }

  next(params: SchedulerParams, card: Card, now: Date, grade: Grade): RecordLogItem {
    return this.scheduler(params).next(card, now, grade);
  }

  /** Preview due intervals for all four grades. */
  preview(params: SchedulerParams, card: Card, now: Date): Record<'again' | 'hard' | 'good' | 'easy', { due: string; interval: string }> {
    const rec = this.scheduler(params).repeat(card, now);
    const out = {} as Record<'again' | 'hard' | 'good' | 'easy', { due: string; interval: string }>;
    for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
      const due = rec[g].card.due;
      out[RATING_LABEL[g]] = { due: due.toISOString(), interval: formatInterval(now, due) };
    }
    return out;
  }

  retrievability(params: SchedulerParams, card: Card, now: Date): number | null {
    if (card.state === State.New) return null;
    return this.scheduler(params).get_retrievability(card, now, false);
  }
}
