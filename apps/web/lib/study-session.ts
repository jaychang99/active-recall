import type { AnswerPayload } from '@recall/contracts';
import type { Queue, QueueItem } from './api';

/** A queue entry of a shared study session (`position` is its stable slot in the session queue). */
export type SessionItem = QueueItem & { position: number };

/** Shared per-entry state: skipped, and the answer once it was opened on some device. Ratings come from `reviews`. */
export interface SessionItemState {
  position: number;
  questionId: string;
  reviewRound: number;
  skipped: boolean;
  phase: 'submitted' | null;
  answerPayload: AnswerPayload | null;
  revealedBeforeAnswer: boolean;
  hintUsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionReview { id: string; questionId: string; reviewRound: number; rating: 1 | 2 | 3 | 4; reviewedAt: string; sessionId: string | null; isCorrect: boolean | null }
export interface SessionCard { questionId: string; version: number; status: QueueItem['card']['status']; flagged: boolean; suspended: boolean; dueAt: string; reps: number; lapses: number }

export interface SessionState {
  session: { id: string; mode: string; startedAt: string; endedAt: string | null; lastPosition: number; lastActiveAt: string | null };
  items: SessionItemState[];
  newItems: SessionItem[];
  reviews: SessionReview[];
  cards: SessionCard[];
}

export type OpenedSession = SessionState & { resumed: boolean; queue: Omit<Queue, 'items'> };

/**
 * What stays on this device only: where it is in the session and unsent drafts. A few KB at most, so it never hits
 * the storage quota the old full-queue snapshot did; entries older than a day are pruned.
 */
interface DeviceState { position: number; drafts: Record<string, AnswerPayload>; mine: string[]; savedAt: number }
const PREFIX = 'rs-study-device:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readDeviceState(sessionId: string): DeviceState | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + sessionId);
    return raw ? (JSON.parse(raw) as DeviceState) : null;
  } catch { return null; }
}

export function writeDeviceState(sessionId: string, state: Omit<DeviceState, 'savedAt'>) {
  try { window.localStorage.setItem(PREFIX + sessionId, JSON.stringify({ ...state, savedAt: Date.now() })); } catch { /* storage unavailable or full */ }
}

/** Drop old device entries, and the full-queue snapshots earlier versions kept in sessionStorage. */
export function pruneDeviceState() {
  try {
    for (const k of Object.keys(window.localStorage)) {
      if (!k.startsWith(PREFIX)) continue;
      const v = JSON.parse(window.localStorage.getItem(k) ?? 'null') as DeviceState | null;
      if (!v || Date.now() - v.savedAt > MAX_AGE_MS) window.localStorage.removeItem(k);
    }
    for (const k of Object.keys(window.sessionStorage)) if (k.startsWith('rs-study:')) window.sessionStorage.removeItem(k);
  } catch { /* ignore */ }
}
