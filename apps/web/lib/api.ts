import type { AnswerPayload, GradeResult, PublicQuestion, ValidationIssue, QuestionType } from '@recall/contracts';
import { clearApiToken, getApiToken, redirectToLogin } from './auth-token';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Every API call carries the signed-in user's bearer token; a 401 refreshes the token once, then goes to /login. */
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(init?.headers as Record<string, string>) };
  let body = init?.body;
  if (init?.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  const send = async (token: string | null) => {
    try {
      return await fetch(`${API_URL}${path}`, { ...init, headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers, body, cache: 'no-store' });
    } catch (e) {
      throw new ApiRequestError(0, 'NETWORK', `API에 연결할 수 없습니다 (${API_URL}). 네트워크와 API 상태를 확인하세요.`, e);
    }
  };
  let token = await getApiToken();
  if (!token) {
    redirectToLogin();
    throw new ApiRequestError(401, 'UNAUTHORIZED', '로그인이 필요합니다');
  }
  let res = await send(token);
  if (res.status === 401) {
    clearApiToken();
    token = await getApiToken(true);
    res = token ? await send(token) : res;
    if (res.status === 401) {
      redirectToLogin();
      throw new ApiRequestError(401, 'UNAUTHORIZED', '세션이 만료되었습니다. 다시 로그인하세요.');
    }
  }
  const text = await res.text();
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') && text ? (JSON.parse(text) as unknown) : text;
  if (!res.ok) {
    const err = (typeof data === 'object' && data ? data : {}) as { error?: string; message?: string; details?: unknown };
    throw new ApiRequestError(res.status, err.error ?? `HTTP_${res.status}`, err.message ?? `Request failed (${res.status})`, err.details);
  }
  return data as T;
}

// ---- Shared API types (mirrors the NestJS responses) ----
export type CardStatus = 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING';
export interface Progress { total: number; suspended: number; flagged: number; new: number; learning: number; review: number; relearning: number; dueToday: number }
export interface Deck { id: string; slug: string; title: string; description: string | null; subject: string; language: string; tags: string[]; createdAt: string; updatedAt: string; deletedAt: string | null; progress: Progress }
export interface DeckDetail extends Deck { noteCount: number; lastReviewedAt: string | null; questionTags: { tag: string; count: number }[] }
export interface SubjectSummary { id: string; name: string; color: string | null; description: string | null; questionCount: number; deckIds: string[]; progress: Progress; createdAt: string; updatedAt: string }
export interface CardInfo { status: CardStatus; dueAt: string; version: number; reps: number; lapses: number; stability: number; difficulty: number; flagged: boolean; suspended: boolean; lastReviewAt: string | null; retrievability: number | null }
export interface IntervalPreview { again: { due: string; interval: string }; hard: { due: string; interval: string }; good: { due: string; interval: string }; easy: { due: string; interval: string } }
export interface QueueItem { questionId: string; externalId: string; deck: { id: string; title: string; subject: string }; type: QuestionType; question: PublicQuestion; hasHint: boolean; card: CardInfo; reviewRound: number; noteCount: number; preview: IntervalPreview | null }
export interface Queue {
  scope: string; subject: string | null; mode: string; deck: { id: string; title: string } | null; generatedAt: string; timezone: string;
  settings: { shuffleChoices: boolean; autoAdvanceAfterRating: boolean; shortcutsEnabled: boolean; dailyReviewGoal: number };
  counts: { learningDue: number; reviewDue: number; reviewBudget: number; newAvailable: number; newBudget: number; reviewedToday: number; newIntroducedToday: number; total: number; eligible: number; suspended: number; buried: number; queued: number };
  nextLearningDueAt: string | null; items: QueueItem[];
}
export interface GradeResponse { questionId: string; grade: GradeResult; answerKey: Record<string, unknown>; explanation: { summary: string; steps?: string[]; misconceptions?: string[]; references?: { document: string; location?: string; url?: string }[] } }
export interface ReviewResponse { review: { id: string; rating: number; reviewedAt: string; reviewRound: number }; card: CardInfo & { stateJson: unknown }; reviewRound: number; replayed: boolean }
export interface Note { id: string; questionId: string; reviewRound: number; reviewLogId: string | null; body: string; createdAt: string; updatedAt: string; review: { id: string; rating: number; reviewedAt: string; isCorrect: boolean | null; undone: boolean } | null }
export interface NotesResponse { questionId: string; currentRound: number; notes: Note[] }
export interface Settings { newCardsPerDay: number; reviewsPerDay: number; timezone: string; shortcutsEnabled: boolean; showIntervalPreview: boolean; autoAdvanceAfterRating: boolean; requestRetention: number; maximumInterval: number; enableFuzz: boolean; shuffleChoices: boolean; /** Study screen: mask metadata that could hint at the answer. */ hideDifficulty: boolean; hideTags: boolean; hideSubject: boolean; hideSource: boolean; newCardOrder: string; dailyReviewGoal: number; leechThreshold: number; /** Partial overrides of the generator prompt's CONFIG block; null = the prompt's own values. */ promptDefaults: Record<string, unknown> | null; updatedAt: string }
export type ImportIssue = ValidationIssue;
export interface ImportPlan { ok: boolean; issues: ImportIssue[]; summary?: { deckId: string; title: string; total: number; byType: Record<string, number> }; /** `id` = internal deck id (null until it exists); `slug` = the batch's deck.id */ deck?: { id: string | null; slug: string; exists: boolean; currentTitle?: string; newTitle: string }; strategy: string; counts: { created: number; updated: number; unchanged: number; resetSchedule: number; deactivated: number; skipped: number }; items: { externalId: string; type: string; op: string; resetSchedule: boolean; reason?: string }[]; deactivate: string[]; committed?: boolean; /** internal id of the imported deck (after commit) */ deckId?: string; deckSlug?: string }
export interface QuestionRow { id: string; externalId: string; type: QuestionType; revision: number; active: boolean; deletedAt: string | null; updatedAt: string; question: PublicQuestion | (PublicQuestion & { answer?: unknown; blanks?: unknown }); card: (Omit<CardInfo, 'retrievability'> & { buriedUntil: string | null }) | null; noteCount: number; reviewCount: number; subjects: { id: string; name: string; color: string | null; source: string }[] }
export interface QuestionPage { page: number; pageSize: number; total: number; items: QuestionRow[] }
export interface ExamScore { objectiveTotal: number; objectiveCorrect: number; objectiveAccuracy: number | null; essayTotal: number; essaySelfScore: number; essayMaxScore: number; byType: Record<string, { total: number; correct: number }>; answered: number; durationSec: number | null }
export interface ExamQuestion { index: number; questionId: string; externalId: string; type: QuestionType; question: PublicQuestion | Record<string, unknown>; answerKey?: Record<string, unknown>; explanation?: GradeResponse['explanation']; response?: { answerPayload: AnswerPayload | null; isCorrect: boolean | null; detail: GradeResult['detail']; selfScore: number | null } | null }
export interface Exam { id: string; deck: { id: string; title: string; subject: string }; title: string; config: Record<string, unknown>; startedAt: string; submittedAt: string | null; score: ExamScore | null; questions: ExamQuestion[] }
export interface ExamSummary { id: string; deck: { id: string; title: string; subject: string }; title: string; config: Record<string, unknown>; startedAt: string; submittedAt: string | null; score: ExamScore | null }
export type Overview = {
  generatedAt: string; timezone: string; windowDays: number; filter: { deckId: string | null; subject: string | null };
  today: { reviewed: number; uniqueCards: number; newIntroduced: number; due: number; overdue: number; goal: number; accuracy: number | null; gradable: number; minutes: number };
  window: { reviews: number; last7: number; last30: number; accuracy: number | null; gradable: number; correct: number; avgSeconds: number | null; totalMinutes: number; revealedBeforeAnswerRate: number | null; hintRate: number | null; practiceAnswers: number; practiceAccuracy: number | null };
  streak: { current: number; longest: number; activeDays: number };
  states: { new: number; learning: number; review: number; relearning: number; suspended: number; flagged: number; buried: number; total: number };
  estimatedRetention: { value: number | null; cards: number; label: string };
  gradeDistribution: { again: number; hard: number; good: number; easy: number };
  byType: { type: string; total: number; correct: number; gradable: number; again: number; accuracy: number | null; errorRate: number | null }[];
  series: { day: string; reviews: number; correct: number; gradable: number; again: number; minutes: number; newCards: number; practice: number }[];
  forecast: { day: string; due: number }[];
  difficultyBuckets: { label: string; count: number }[];
  stabilityBuckets: { label: string; count: number }[];
  leeches: { questionId: string; lapses: number; prompt: string; deck: string; type: string }[];
  hardest: { questionId: string; again: number; prompt: string; deck: string; type: string }[];
  decks: { id: string; title: string; subject: string; total: number; new: number; learning: number; review: number; relearning: number; dueToday: number; reviewsInWindow: number; accuracy: number | null; gradable: number; correct: number }[];
  exams: { id: string; title: string; deck: { id: string; title: string }; submittedAt: string; score: ExamScore | null }[];
};
export interface Heatmap { timezone: string; days: { day: string; count: number }[]; max: number }
