'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Eye, Flag, History, Info, Lightbulb, PauseCircle, SkipForward, Undo2 } from 'lucide-react';
import Link from '@/components/ui/navigation-link';
import { Markdown } from '@/components/questions/markdown';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AnswerPayload } from '@recall/contracts';
import { api, ApiRequestError, type GradeResponse, type Queue, type QueueItem, type ReviewResponse } from '@/lib/api';
import { pruneDeviceState, readDeviceState, writeDeviceState, type OpenedSession, type SessionItem, type SessionState } from '@/lib/study-session';
import { useShortcuts } from '@/lib/shortcuts/provider';
import { isEditableTarget, ownsArrowKeys } from '@/lib/shortcuts/manager';
import { cn, uid } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tooltip } from '@/components/ui/tooltip';
import { ErrorState } from '@/components/ui/misc';
import { QuestionPrompt, QuestionRenderer } from '@/components/questions/question-renderer';
import type { Phase } from '@/components/questions/types';
import { ExplanationPanel, Verdict } from './explanation-panel';
import { RATINGS, RatingBar } from './rating-bar';
import { NotesPanel } from './notes-panel';
import { CardInfoTable } from './card-info';
import { CopyQuestionButtons } from './copy-question';
import { MetaMaskMenu, useMetaMask } from './meta-mask-menu';
import { useEssayAnswerView } from '@/components/questions/essay-answer-view';
import { MetaChip } from '@/components/questions/masked-chip';
import { slotState, type MetaControl } from '@/components/questions/meta-mask';
import { useSettings } from '@/components/layout/settings-context';
import { dismissAnswerKeyboard } from '@/lib/answer-focus';
import { StudyActions } from './study-actions';
import { StudyNav, type NavCell } from './study-nav';
import { StudyRunner } from './study-runner';
import { PreviousResponsesPanel, usePreviousResponses } from './previous-responses';
import { LlmLinksPanel } from './llm-links';
import { AttemptCounters, AttemptCountersHelp } from './attempt-counters';
import { LoadingState } from '@/components/ui/loading';

export interface StudyParams {
  scope: string; // deck id or 'all'
  mode: 'scheduled' | 'new' | 'cram' | 'mistakes' | 'flagged' | 'practice' | 'browse';
  subject?: string;
  tags?: string[];
  types?: string[];
  difficultyMin?: number;
  difficultyMax?: number;
  limit?: number;
}

type CardState = 'answering' | 'submitted' | 'rated';

/**
 * How a card was left: ←/→, jumps and undo restore it exactly (a draft, a revealed answer, a given rating).
 * `remote` marks a rating made on another device in this session or on another study page.
 */
interface CardMemo { phase: CardState; answer: AnswerPayload | null; grade: GradeResponse | null; revealedBeforeAnswer: boolean; hintUsed: boolean; hint: string | null; rating?: 1 | 2 | 3 | 4; reviewId?: string; interval?: string | null; isCorrect?: boolean | null; remote?: 'device' | 'elsewhere' }
/** Re-queued copies share the question id, so a card in the session is question + review round. */
const keyOf = (i: { questionId: string; reviewRound: number }) => `${i.questionId}:${i.reviewRound}`;
/** A queue entry; `pending` until the server confirms a re-queued copy. */
type LiveItem = SessionItem & { pending?: boolean };
const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

/**
 * Fold the server's view of the session into the card memos: ratings (from the review log), answers opened on any
 * device, and ratings undone elsewhere. Keys this device changed after the request started are left alone.
 */
function mergeMemos(prev: Record<string, CardMemo>, state: SessionState, mine: Set<string>, changedSince: (key: string) => boolean, drafts?: Record<string, AnswerPayload>): Record<string, CardMemo> {
  const next = { ...prev };
  for (const it of state.items) {
    const key = keyOf(it);
    if (changedSince(key)) continue;
    const cur = next[key];
    const review = state.reviews.find((r) => r.questionId === it.questionId && r.reviewRound === it.reviewRound);
    if (review) {
      if (cur?.phase === 'rated' && cur.reviewId === review.id) continue;
      next[key] = {
        phase: 'rated', answer: cur?.answer ?? it.answerPayload, grade: cur?.grade ?? null, revealedBeforeAnswer: cur?.revealedBeforeAnswer ?? it.revealedBeforeAnswer, hintUsed: cur?.hintUsed ?? it.hintUsed, hint: cur?.hint ?? null,
        rating: review.rating, reviewId: review.id, isCorrect: review.isCorrect, interval: cur?.interval ?? null,
        remote: mine.has(review.id) ? undefined : review.sessionId === state.session.id ? 'device' : 'elsewhere',
      };
    } else if (cur?.phase === 'rated') {
      next[key] = { ...cur, phase: it.phase || cur.grade ? 'submitted' : 'answering', rating: undefined, reviewId: undefined, isCorrect: undefined, remote: undefined };
    } else if (it.phase === 'submitted' && (!cur || cur.phase === 'answering')) {
      next[key] = { phase: 'submitted', answer: it.answerPayload, grade: null, revealedBeforeAnswer: it.revealedBeforeAnswer, hintUsed: it.hintUsed, hint: cur?.hint ?? null };
    } else if (!cur && drafts?.[key]) {
      next[key] = { phase: 'answering', answer: drafts[key]!, grade: null, revealedBeforeAnswer: false, hintUsed: false, hint: null };
    }
  }
  return next;
}

interface Done { key?: string; questionId: string; rating?: number; isCorrect: boolean | null; reviewId?: string }

function hasAnswer(p: AnswerPayload | null): boolean {
  if (!p) return false;
  switch (p.type) {
    case 'single_choice': return p.choiceId !== null;
    case 'multiple_choice': return p.choiceIds.length > 0;
    case 'true_false': return p.value !== null;
    case 'short_answer': return p.text.trim().length > 0;
    case 'essay': return p.text.trim().length > 0;
    case 'cloze': return Object.values(p.blanks).some((v) => v.trim().length > 0);
    case 'ordering': return p.orderedIds.length > 0;
    case 'matching': return p.pairs.some((x) => x.rightId);
    case 'numeric': return p.value !== null;
    case 'cloze_select': return Object.values(p.blanks).some(Boolean);
    case 'statement_set': return Object.values(p.values).some((v) => v !== null && v !== undefined);
    case 'categorize': return Object.values(p.assignments).some(Boolean);
    case 'two_tier': return p.choiceId !== null && p.reasonId !== null;
    case 'recall_card': return (p.text ?? '').trim().length > 0 || typeof p.selfCorrect === 'boolean';
    case 'stepwise': return Object.values(p.answers).some((v) => v.trim().length > 0);
    case 'highlight': return p.segmentIds.length > 0;
    case 'cloze_bank': return Object.values(p.blanks).some(Boolean);
    case 'code_cloze': return Object.values(p.blanks).some((v) => v.trim().length > 0);
    case 'matrix': return p.cells.length > 0;
    case 'numeric_grid': return Object.values(p.values).some((v) => v !== null && v !== undefined);
    case 'list_answer': return p.entries.some((e) => e.trim().length > 0);
    case 'image_hotspot': return p.points.length > 0;
    case 'parsons': return p.lines.length > 0;
    case 'find_and_fix': return p.fixes.length > 0;
    case 'coordinate_point': return p.points.length > 0;
    case 'regex_answer': return p.pattern.trim().length > 0;
  }
}

const MODE_LABEL: Record<StudyParams['mode'], string> = { scheduled: '예정된 학습', new: '새 카드만', cram: '전체 훑기 (cram)', mistakes: '틀린 문제', flagged: '표시한 문제', practice: '연습 (스케줄 영향 없음)', browse: '구경 (기록 없음)' };

function openBody(p: StudyParams, fresh: boolean) {
  return {
    scope: p.scope, mode: p.mode, subject: p.subject, tags: p.tags?.length ? p.tags : undefined, types: p.types?.length ? p.types : undefined,
    difficultyMin: p.difficultyMin || undefined, difficultyMax: p.difficultyMax || undefined, limit: p.limit ?? (p.mode === 'browse' ? 1000 : 200), fresh: fresh || undefined,
  };
}

const RATING_PARTICLE: Record<number, string> = { 1: '로', 2: '으로', 3: '으로', 4: '으로' };

export function StudyScreen({ params }: { params: StudyParams }) {
  const qc = useQueryClient();
  const { settings } = useSettings();
  const meta = useMetaMask();
  const essayView = useEssayAnswerView();
  // Card whose answer is open: the reveal-on-answer option shows hidden metadata only for exactly this card,
  // so the next card never flashes its metadata even for the frame before the phase resets.
  const [metaRevealedFor, setMetaRevealedFor] = useState<string | null>(null);
  // Bumped by "새 세션" / "더 학습하기": opens a fresh session instead of joining the active one.
  const [openNonce, setOpenNonce] = useState(0);
  // The session is opened once per page (and per fresh start) and its queue is then frozen: refetches must never
  // reorder or drop cards under the learner. Reopening the same study page — reload, another tab, another device
  // within 6 hours — joins the same session on the server.
  const opened = useQuery({
    queryKey: ['study-open', params, openNonce],
    queryFn: () => api<OpenedSession>('/study/sessions/open', { method: 'POST', json: openBody(params, openNonce > 0) }),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
  const [session, setSession] = useState<{ id: string; startedAt: string; resumed: boolean } | null>(null);
  const [baseItems, setBaseItems] = useState<LiveItem[] | null>(null);
  const [queueMeta, setQueueMeta] = useState<OpenedSession['queue'] | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<CardState>('answering');
  const [answer, setAnswer] = useState<AnswerPayload | null>(null);
  const [grade, setGrade] = useState<GradeResponse | null>(null);
  const [revealedBeforeAnswer, setRevealedBeforeAnswer] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [hintPending, setHintPending] = useState(false);
  const [showExplanation, setShowExplanation] = useState(true);
  // "이전 응답 보기": closed on every card until asked for.
  const [showPrevious, setShowPrevious] = useState(false);
  // Cards visited this session, by keyOf(): moving between cards stashes the current one here and restores the target.
  const [memos, setMemos] = useState<Record<string, CardMemo>>({});
  // Rated cards in rating order; Cmd/Ctrl+Z and U walk back through it.
  const [history, setHistory] = useState<string[]>([]);
  const [pendingRating, setPendingRating] = useState<1 | 2 | 3 | 4 | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [notesFocus, setNotesFocus] = useState(0);
  // Positions skipped (buried/suspended) in this session.
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const startedAt = useRef<number>(0);
  const digitHandler = useRef<((n: number) => void) | null>(null);
  const submitLock = useRef(false);
  const studyRoot = useRef<HTMLDivElement>(null);
  const jumpInput = useRef<HTMLInputElement>(null);
  const [shuffleSeed] = useState(() => uid());
  // Reviews this device made in the session (so its own ratings are not labelled as another device's).
  const mine = useRef<Set<string>>(new Set());
  // When this device last changed a card (rated, undid, opened) or skipped a position: a sync that started
  // earlier must not overwrite that.
  const localChange = useRef<Map<string, number>>(new Map());
  const touch = (key: string) => localChange.current.set(key, Date.now());
  const baseItemsRef = useRef<LiveItem[] | null>(null);
  useEffect(() => { baseItemsRef.current = baseItems; }, [baseItems]);

  // Show a card as it was left, or fresh when it has never been touched.
  const applyMemo = useCallback((m: CardMemo | undefined, key: string | null) => {
    setPhase(m?.phase ?? 'answering');
    setMetaRevealedFor(m && m.phase !== 'answering' ? key : null);
    setAnswer(m?.answer ?? null);
    setGrade(m?.grade ?? null);
    setRevealedBeforeAnswer(m?.revealedBeforeAnswer ?? false);
    setHintUsed(m?.hintUsed ?? false);
    setHint(m?.hint ?? null);
    setShowExplanation(true);
    setShowPrevious(false);
    setPendingRating(null);
    startedAt.current = Date.now();
    submitLock.current = false;
  }, []);
  const resetCard = useCallback(() => applyMemo(undefined, null), [applyMemo]);

  // Start (or join) the session: shared state from the server, position and drafts from this device.
  useEffect(() => {
    const d = opened.data;
    if (!d) return;
    pruneDeviceState();
    const device = readDeviceState(d.session.id);
    mine.current = new Set(device?.mine ?? []);
    localChange.current = new Map();
    const list = [...d.newItems].sort(byPosition);
    const skippedNow = new Set(d.items.filter((i) => i.skipped).map((i) => i.position));
    const memosNow = mergeMemos({}, d, mine.current, () => false, device?.drafts);
    const visible = list.filter((i) => !skippedNow.has(i.position));
    const wanted = device?.position ?? d.session.lastPosition;
    let at = visible.findIndex((i) => i.position >= wanted);
    if (at < 0) at = visible.length ? visible.length - 1 : 0;
    setSession({ id: d.session.id, startedAt: d.session.startedAt, resumed: d.resumed });
    setQueueMeta(d.queue);
    setBaseItems(list);
    setSkipped(skippedNow);
    setMemos(memosNow);
    // Cmd/Ctrl+Z walks back through the session's ratings, oldest first in the list.
    const byKey = new Set(list.map((i) => keyOf(i)));
    setHistory(d.reviews.filter((r) => byKey.has(keyOf(r))).map((r) => keyOf(r)));
    setIndex(at);
    const current = visible[at];
    applyMemo(current ? memosNow[keyOf(current)] : undefined, current ? keyOf(current) : null);
  }, [opened.data, applyMemo]);

  // Patch one card's state in the frozen queue (every entry of that question). The react-query cache is not the
  // source of truth once the queue is frozen, so updates must land here or the next rating sends a stale version.
  const patchCard = useCallback((questionId: string, patch: Partial<QueueItem['card']>) => {
    setBaseItems((b) => (b ? b.map((i) => (i.questionId === questionId ? { ...i, card: { ...i.card, ...patch } } : i)) : b));
  }, []);

  // Other devices' work: new entries (re-queued copies), removed copies, skips, card versions and memos.
  const merge = useCallback((state: SessionState, since: number) => {
    const changedSince = (key: string) => (localChange.current.get(key) ?? 0) > since;
    const live = new Set(state.items.map((i) => i.position));
    const cards = new Map(state.cards.map((c) => [c.questionId, c]));
    setBaseItems((b) => {
      if (!b) return b;
      const incoming = state.newItems.filter((n) => !b.some((i) => i.position === n.position && !i.pending));
      const incomingKeys = new Set(incoming.map((n) => keyOf(n)));
      const kept = b.filter((i) => (i.pending ? !incomingKeys.has(keyOf(i)) : live.has(i.position)));
      return [...kept, ...incoming]
        .map((i) => { const c = cards.get(i.questionId); return c && c.version !== i.card.version ? { ...i, card: { ...i.card, version: c.version, status: c.status, flagged: c.flagged, suspended: c.suspended } } : i; })
        .sort(byPosition);
    });
    setSkipped((prev) => {
      const next = new Set(state.items.filter((i) => i.skipped).map((i) => i.position));
      for (const p of prev) if ((localChange.current.get(`#${p}`) ?? 0) > since) next.add(p);
      return next;
    });
    setMemos((m) => mergeMemos(m, state, mine.current, changedSince));
  }, []);

  const syncing = useRef(false);
  const sync = useCallback(async () => {
    if (!session || syncing.current) return null;
    syncing.current = true;
    const since = Date.now();
    try {
      const known = Math.max(-1, ...(baseItemsRef.current ?? []).filter((i) => !i.pending).map((i) => i.position)) + 1;
      const state = await api<SessionState>(`/study/sessions/${session.id}/state?known=${known}`);
      merge(state, since);
      return state;
    } catch { return null; } finally { syncing.current = false; }
  }, [session, merge]);
  // Stay in step with other devices: every 20 s while visible, on focus, and shortly after each card change.
  useEffect(() => {
    if (!session) return;
    const tick = () => { if (document.visibilityState === 'visible') void sync(); };
    const timer = window.setInterval(tick, 20_000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); };
  }, [session, sync]);

  const items = useMemo(() => (baseItems ?? []).filter((i) => !skipped.has(i.position)), [baseItems, skipped]);
  const item = items[index] ?? null;
  const cardKey = item ? keyOf(item) : null;
  const finished = !!baseItems && (items.length === 0 || index >= items.length);
  useEffect(() => {
    if (!session || !cardKey) return;
    const t = window.setTimeout(() => void sync(), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey]);
  // This device's place and drafts (tiny, in localStorage); the session's last place on the server for other devices.
  const position = item?.position ?? null;
  useEffect(() => {
    if (!session || position === null) return;
    const drafts: Record<string, AnswerPayload> = {};
    for (const [k, m] of Object.entries(memos)) if (m.phase === 'answering' && m.answer && hasAnswer(m.answer)) drafts[k] = m.answer;
    if (cardKey && phase === 'answering' && hasAnswer(answer)) drafts[cardKey] = answer!;
    writeDeviceState(session.id, { position, drafts, mine: [...mine.current] });
  }, [session, position, memos, cardKey, phase, answer]);
  useEffect(() => {
    if (!session || position === null) return;
    const t = window.setTimeout(() => { api(`/study/sessions/${session.id}/position`, { method: 'PATCH', json: { position } }).catch(() => {}); }, 800);
    return () => window.clearTimeout(t);
  }, [session, position]);
  const isPractice = params.mode === 'practice';
  // Browse: look at every question (limits, due dates, suspend/bury ignored); nothing is recorded, no rating step.
  const isBrowse = params.mode === 'browse';
  const unrated = isPractice || isBrowse;
  // Opt-in (settings): no Easy after a wrong or partial answer, or an answer revealed without trying.
  const easyBlocked = settings.blockEasyWhenWrong && !unrated && phase === 'submitted' && (revealedBeforeAnswer || grade?.grade.isCorrect === false);
  const easyBlockedReason = revealedBeforeAnswer ? "답을 내지 않고 정답을 봐서 '쉬움'은 막혀 있습니다" : "틀린 답이라 '쉬움'은 막혀 있습니다";
  // Nth time this question comes up in this session (re-queued copies after Again count).
  const sessionAttempt = item ? items.slice(0, index + 1).filter((i) => i.questionId === item.questionId).length : 0;

  // Remember the current card before leaving it. A rated card changes only through rate/undo.
  const stash = useCallback(() => {
    if (!cardKey) return;
    const touched = phase !== 'answering' || hasAnswer(answer) || !!hint;
    setMemos((m) => {
      if (m[cardKey]?.phase === 'rated') return m;
      if (touched) return { ...m, [cardKey]: { phase, answer, grade, revealedBeforeAnswer, hintUsed, hint } };
      if (!(cardKey in m)) return m;
      const rest = { ...m };
      delete rest[cardKey];
      return rest;
    });
  }, [cardKey, phase, answer, grade, revealedBeforeAnswer, hintUsed, hint]);

  const moveTo = useCallback((target: number) => {
    stash();
    const t = items[target];
    applyMemo(t ? memos[keyOf(t)] : undefined, t ? keyOf(t) : null);
    setIndex(target);
  }, [stash, items, memos, applyMemo]);

  // The next card still to do after this one, then (unless a re-queued copy was just appended at the end)
  // the ones skipped earlier; items.length when nothing is left.
  const pickNext = useCallback((appended: boolean) => {
    const open = (i: number) => {
      const m = memos[keyOf(items[i]!)];
      return unrated ? !m || m.phase === 'answering' : m?.phase !== 'rated';
    };
    for (let i = index + 1; i < items.length; i++) if (open(i)) return i;
    if (appended) return items.length;
    for (let i = 0; i < index; i++) if (open(i)) return i;
    return items.length;
  }, [memos, items, index, unrated]);

  // Every mode (browse included) counts as having opened the deck/subject for the "recent" lists.
  useEffect(() => {
    if (params.scope === 'all' && !params.subject) return;
    api('/study/visit', { method: 'POST', json: { deckId: params.scope === 'all' ? undefined : params.scope, subject: params.subject } })
      .then(() => { void qc.invalidateQueries({ queryKey: ['decks'] }); void qc.invalidateQueries({ queryKey: ['subjects'] }); })
      .catch(() => {});
  }, [params.scope, params.subject, qc]);

  useEffect(() => {
    if (finished && session) api(`/study/sessions/${session.id}/end`, { method: 'PATCH' }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  useEffect(() => {
    if (startedAt.current === 0) startedAt.current = Date.now();
  }, []);

  const registerDigitHandler = useCallback((fn: ((n: number) => void) | null) => { digitHandler.current = fn; }, []);

  const gradeMut = useMutation({
    mutationFn: async ({ payload }: { payload: AnswerPayload | null; revealed: boolean }) => {
      if (!item) throw new Error('no item');
      const res = await api<GradeResponse>(`/questions/${item.questionId}/grade`, { method: 'POST', json: { answerPayload: payload } });
      if (isPractice) await api('/study/practice', { method: 'POST', json: { questionId: item.questionId, sessionId: session?.id, answerPayload: payload, elapsedMs: Date.now() - startedAt.current } }).catch(() => {});
      return res;
    },
    onSuccess: (res, { payload, revealed }) => {
      setGrade(res);
      setPhase('submitted');
      if (!item) return;
      const key = keyOf(item);
      setMetaRevealedFor(key);
      touch(key);
      // practice/browse have no rating step: an opened answer is what counts as done
      if (unrated) setMemos((m) => ({ ...m, [key]: { phase: 'submitted', answer: payload, grade: res, revealedBeforeAnswer: revealed, hintUsed, hint, isCorrect: revealed ? null : res.grade.isCorrect } }));
      // Share the opened answer with the session's other devices.
      if (session) api(`/study/sessions/${session.id}/items/${item.position}/state`, { method: 'PUT', json: { answerPayload: payload, revealedBeforeAnswer: revealed, hintUsed } }).catch(() => {});
    },
    onError: (e: Error) => { submitLock.current = false; toast.error('채점에 실패했습니다', { description: e.message }); },
  });

  const submit = useCallback(() => {
    if (phase !== 'answering' || submitLock.current || !item) return;
    if (!hasAnswer(answer)) { toast('답안을 입력한 뒤 제출하세요', { description: 'Space 키로 답을 바로 공개할 수도 있습니다.' }); return; }
    submitLock.current = true;
    dismissAnswerKeyboard();
    gradeMut.mutate({ payload: answer, revealed: false });
  }, [phase, item, answer, gradeMut]);

  const reveal = useCallback(() => {
    if (phase !== 'answering' || submitLock.current || !item) return;
    submitLock.current = true;
    dismissAnswerKeyboard();
    setRevealedBeforeAnswer(true);
    gradeMut.mutate({ payload: hasAnswer(answer) ? answer : null, revealed: true });
  }, [phase, item, answer, gradeMut]);

  const next = useCallback((opts?: { appended?: boolean }) => {
    const target = pickNext(!!opts?.appended);
    if (target < index) toast('건너뛴 문제로 돌아갑니다', { description: `${target + 1}번 문제` });
    moveTo(target);
  }, [pickNext, moveTo, index]);

  const advanceUnrated = useCallback(() => {
    if (!item || !grade) return;
    next();
  }, [item, grade, next]);

  const reviewMut = useMutation({
    mutationFn: async (rating: 1 | 2 | 3 | 4) => {
      if (!item) throw new Error('no item');
      const key = uid();
      const isCorrect = revealedBeforeAnswer ? null : (grade?.grade.isCorrect ?? null);
      return api<ReviewResponse>('/reviews', {
        method: 'POST',
        json: { questionId: item.questionId, rating, idempotencyKey: key, sessionId: session?.id, elapsedMs: Date.now() - startedAt.current, isCorrect, revealedBeforeAnswer, hintUsed, answerPayload: answer, expectedVersion: item.card.version },
      });
    },
    onSuccess: (res, rating) => {
      if (!item) return;
      const key = keyOf(item);
      const interval = item.preview ? item.preview[RATINGS[rating - 1]!.key].interval : null;
      mine.current.add(res.review.id);
      touch(key);
      setMemos((m) => ({ ...m, [key]: { phase: 'rated', answer, grade, revealedBeforeAnswer, hintUsed, hint, rating, reviewId: res.review.id, interval, isCorrect: grade?.grade.isCorrect ?? null } }));
      setHistory((h) => [...h.filter((k) => k !== key), key]);
      setPhase('rated');
      void qc.invalidateQueries({ queryKey: ['notes', item.questionId] });
      void qc.invalidateQueries({ queryKey: ['responses', item.questionId] });
      for (const k of ['decks', 'subjects', 'deck', 'overview']) void qc.invalidateQueries({ queryKey: [k] });
      // Again/Hard on a learning step re-queues the card at the end of this session so it is seen again today.
      const appended = rating === 1 && (res.card.status === 'LEARNING' || res.card.status === 'RELEARNING') && !isPractice;
      if (appended) {
        // Shown at once; the server confirms its slot (another device may have appended meanwhile).
        const copy: LiveItem = { ...item, position: Math.max(...(baseItemsRef.current ?? [item]).map((i) => i.position)) + 1, pending: true, card: { ...item.card, version: res.card.version, status: res.card.status }, reviewRound: res.reviewRound + 1, reviewsTodayBefore: item.reviewsTodayBefore + 1, preview: res.nextPreview ?? null };
        setBaseItems((b) => (b ? [...b, copy] : b));
        if (session) {
          api<SessionItem>(`/study/sessions/${session.id}/items`, { method: 'POST', json: { questionId: item.questionId, reviewRound: copy.reviewRound } })
            .then((saved) => setBaseItems((b) => (b ? b.map((i) => (i.pending && keyOf(i) === keyOf(copy) ? saved : i)).sort(byPosition) : b)))
            .catch(() => {});
        }
      }
      if (settings.autoAdvanceAfterRating) next({ appended });
    },
    onError: async (e: Error, rating) => {
      setPendingRating(null);
      if (e instanceof ApiRequestError && e.status === 409 && item) {
        // Our copy of the card is stale. Usually another device (or another study page) rated it already: show
        // that rating instead of saving a second review. Otherwise take the server's version and offer a re-send.
        const current = (e.details as { currentVersion?: number } | undefined)?.currentVersion;
        if (typeof current === 'number') patchCard(item.questionId, { version: current });
        const state = await sync();
        const other = state?.reviews.find((r) => r.questionId === item.questionId && r.reviewRound === item.reviewRound);
        if (other) {
          const ko = RATINGS[other.rating - 1]!.ko;
          toast('이 카드는 다른 곳에서 이미 평가되었습니다', { description: `‘${ko}’${RATING_PARTICLE[other.rating]} 평가된 결과를 보여 드립니다. 바꾸려면 ‘다시 평가’를 누르세요.` });
          return;
        }
        toast.error('카드 상태가 다른 곳에서 바뀌어 평가를 저장하지 못했습니다', {
          description: '최신 상태로 맞췄습니다. 평가를 다시 저장할 수 있습니다.',
          action: typeof current === 'number' ? { label: '다시 저장', onClick: () => { setPendingRating(rating); reviewMut.mutate(rating); } } : undefined,
        });
      } else toast.error('평가를 저장하지 못했습니다', { description: e.message });
    },
  });

  const rate = useCallback((rating: 1 | 2 | 3 | 4) => {
    if (phase !== 'submitted' || reviewMut.isPending || pendingRating) return;
    if (rating === 4 && easyBlocked) { toast(easyBlockedReason, { description: '설정 › 틀리면 쉬움 막기에서 끌 수 있습니다.' }); return; }
    setPendingRating(rating);
    reviewMut.mutate(rating);
  }, [phase, reviewMut, pendingRating, easyBlocked, easyBlockedReason]);

  // Undo reopens the card with its answer still shown, so it can be re-rated straight away.
  const undoMut = useMutation({
    mutationFn: ({ reviewId }: { key: string; reviewId: string }) => api<ReviewResponse>(`/reviews/${reviewId}/undo`, { method: 'POST' }),
    onSuccess: (res, { key, reviewId }) => {
      const target = items.findIndex((i) => keyOf(i) === key);
      const undone = items[target];
      const memo = memos[key];
      const copyKey = undone ? keyOf({ ...undone, reviewRound: res.reviewRound + 1 }) : null;
      // Reopen with the answer shown when there was one (here or on the device that rated it), else to answer anew.
      const reopened: CardMemo | undefined = memo && (memo.grade || memo.answer || memo.revealedBeforeAnswer) ? { phase: 'submitted', answer: memo.answer, grade: memo.grade, revealedBeforeAnswer: memo.revealedBeforeAnswer, hintUsed: memo.hintUsed, hint: memo.hint } : undefined;
      void reviewId;
      touch(key);
      setHistory((h) => h.filter((k) => k !== key));
      if (undone) {
        const copy = (baseItemsRef.current ?? []).find((i) => keyOf(i) === copyKey);
        if (copy) {
          if (copyKey) touch(copyKey);
          setBaseItems((b) => (b ? b.filter((i) => keyOf(i) !== copyKey) : b));
          if (session && !copy.pending) api(`/study/sessions/${session.id}/items/${copy.position}`, { method: 'DELETE' }).catch(() => {});
        }
        // keep the card's new version (undo bumps it too) so the next rating does not conflict
        const { stateJson, ...card } = res.card;
        void stateJson;
        patchCard(undone.questionId, card);
        void qc.invalidateQueries({ queryKey: ['notes', undone.questionId] });
        stash();
        applyMemo(reopened, key);
        setIndex(target);
      }
      setMemos((m) => {
        const rest = { ...m };
        if (copyKey) delete rest[copyKey];
        if (reopened) rest[key] = reopened;
        else delete rest[key];
        return rest;
      });
      for (const k of ['decks', 'subjects', 'deck', 'overview']) void qc.invalidateQueries({ queryKey: [k] });
      toast.success(reopened ? '평가를 되돌렸습니다. 다시 평가하세요' : '평가를 되돌렸습니다', { description: 'FSRS 상태와 복습 기록이 평가 전으로 복구되었습니다.' });
    },
    onError: (e: Error) => toast.error('되돌리지 못했습니다', { description: e.message }),
  });

  // The card on screen when it is rated, otherwise the most recently rated one.
  const undoKey = cardKey && memos[cardKey]?.phase === 'rated' ? cardKey : (history.at(-1) ?? null);
  const undo = useCallback(() => {
    if (undoMut.isPending || reviewMut.isPending) return;
    const reviewId = undoKey ? memos[undoKey]?.reviewId : undefined;
    if (!undoKey || !reviewId) { toast('되돌릴 평가가 없습니다'); return; }
    undoMut.mutate({ key: undoKey, reviewId });
  }, [undoKey, memos, undoMut, reviewMut.isPending]);

  const cardMut = useMutation({
    mutationFn: ({ action }: { action: 'flag' | 'unflag' | 'suspend' | 'bury' }) => api(`/cards/${item!.questionId}/${action}`, { method: 'POST' }),
    onSuccess: (_r, v) => {
      if (!item) return;
      if (v.action === 'flag' || v.action === 'unflag') {
        const flagged = v.action === 'flag';
        patchCard(item.questionId, { flagged });
        toast.success(flagged ? '문제를 표시했습니다' : '표시를 해제했습니다');
      } else {
        toast.success(v.action === 'bury' ? '내일까지 묻어두었습니다' : '문제를 보류했습니다', { description: '학습 큐에서 제외됩니다.' });
        // Same order as "next", counted in the list without this card.
        const target = pickNext(false);
        const t = items[target];
        localChange.current.set(`#${item.position}`, Date.now());
        setSkipped((s) => new Set(s).add(item.position));
        if (session) api(`/study/sessions/${session.id}/items/${item.position}`, { method: 'PATCH', json: { skipped: true } }).catch(() => {});
        applyMemo(t ? memos[keyOf(t)] : undefined, t ? keyOf(t) : null);
        setIndex(target > index ? target - 1 : target);
      }
    },
    onError: (e: Error) => toast.error('처리하지 못했습니다', { description: e.message }),
  });

  const showHint = useCallback(async () => {
    if (!item?.hasHint || phase !== 'answering' || hintPending) return;
    setHintPending(true);
    try {
      if (!hint) {
        const r = await api<{ hint: string | null }>(`/study/hint/${item.questionId}`);
        setHint(r.hint);
      }
      setHintUsed(true);
    } catch (error) { toast.error('힌트를 불러오지 못했습니다', { description: (error as Error).message }); }
    finally { setHintPending(false); }
  }, [item, hint, phase, hintPending]);

  // Grading/rating callbacks apply to the card they were started on, so moving waits for them.
  const busy = gradeMut.isPending || reviewMut.isPending || undoMut.isPending || cardMut.isPending || hintPending;
  const goTo = useCallback((target: number) => {
    if (target === index) return;
    if (target < 0 || target >= items.length) { toast(target < 0 ? '첫 문제입니다' : '마지막 문제입니다'); return; }
    if (busy) { toast('저장 중입니다. 잠시 후 이동하세요'); return; }
    dismissAnswerKeyboard();
    moveTo(target);
  }, [index, items.length, busy, moveTo]);
  const cells: NavCell[] = items.map((it, i) => {
    const m = memos[keyOf(it)];
    if (m?.phase === 'rated') return { status: 'rated', rating: m.rating };
    if (i === index) return { status: phase !== 'answering' ? 'answered' : hasAnswer(answer) ? 'draft' : 'todo' };
    return { status: !m ? 'todo' : m.phase === 'answering' ? 'draft' : 'answered' };
  });
  const lastRated = history.length ? memos[history[history.length - 1]!] : undefined;
  const previous = usePreviousResponses(item?.questionId ?? '', item?.reviewRound ?? 0, session ? Date.parse(session.startedAt) : 0, !!item && phase !== 'answering');
  // Done = rated cards (and, without a rating step, opened ones), wherever they were rated.
  const done: Done[] = items.flatMap((it) => {
    const k = keyOf(it);
    const m = memos[k];
    if (m?.phase === 'rated') return [{ key: k, questionId: it.questionId, rating: m.rating, isCorrect: m.isCorrect ?? null, reviewId: m.reviewId }];
    if (unrated && m && m.phase !== 'answering') return [{ key: k, questionId: it.questionId, isCorrect: m.isCorrect ?? null }];
    return [];
  });

  const metaControl: MetaControl = { mask: meta.mask, revealed: meta.revealOnAnswer && phase !== 'answering' && cardKey !== null && metaRevealedFor === cardKey, onToggle: meta.toggle };
  const roundHidden = slotState(metaControl, 'round') === 'masked';
  // One seed for the renderer and the copy buttons, so a copied prompt lists options as on screen.
  const viewSeed = settings.shuffleChoices && item ? `${shuffleSeed}:${item.reviewRound}` : null;
  const phaseForRenderer: Phase = phase === 'answering' ? 'answering' : revealedBeforeAnswer ? 'revealed' : 'submitted';
  useEffect(() => {
    if (cardKey && window.matchMedia('(max-width: 767px)').matches) studyRoot.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [cardKey]);
  const shortcutsOn = settings.shortcutsEnabled;

  // Another device changed the card on screen: rated it, undid its rating, or opened its answer (when nothing was
  // typed here yet). Local changes keep memos and the screen in step already, so only those cases differ.
  useEffect(() => {
    if (!cardKey) return;
    const m = memos[cardKey];
    if (m?.phase === 'rated' && phase !== 'rated') applyMemo({ ...m, answer: answer ?? m.answer, grade: grade ?? m.grade, revealedBeforeAnswer: revealedBeforeAnswer || m.revealedBeforeAnswer }, cardKey);
    else if (phase === 'rated' && m && m.phase !== 'rated') applyMemo({ ...m, grade: m.grade ?? grade }, cardKey);
    else if (phase === 'answering' && m?.phase === 'submitted' && !hasAnswer(answer)) applyMemo(m, cardKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memos, cardKey]);

  // A card restored with its answer open (reload, another device) has no grade yet: grade the stored answer again
  // (grading has no side effects) so the result view can show the key and explanation.
  useEffect(() => {
    if (!item || !cardKey || phase === 'answering' || grade) return;
    let cancelled = false;
    const key = cardKey;
    api<GradeResponse>(`/questions/${item.questionId}/grade`, { method: 'POST', json: { answerPayload: revealedBeforeAnswer && !hasAnswer(answer) ? null : answer } })
      .then((res) => {
        if (cancelled) return;
        setGrade(res);
        setMemos((m) => (m[key] ? { ...m, [key]: { ...m[key]!, grade: res } } : m));
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey, phase, grade]);

  // "새 세션" / "더 학습하기": end the active session for this page and build a new queue.
  const [confirmRestart, setConfirmRestart] = useState(false);
  const restart = useCallback(() => {
    setConfirmRestart(false);
    setBaseItems(null);
    setQueueMeta(null);
    setSession(null);
    setMemos({});
    setHistory([]);
    setSkipped(new Set());
    setIndex(0);
    resetCard();
    setOpenNonce((n) => n + 1);
  }, [resetCard]);
  const typing = item?.type === 'essay' || item?.type === 'short_answer' || item?.type === 'cloze' || item?.type === 'numeric' || item?.type === 'stepwise' || item?.type === 'recall_card';

  useShortcuts(
    'study',
    [
      { keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], description: phase === 'answering' ? '보기 선택 (1–9)' : '평가 Again / Hard / Good / Easy (1–4)', group: '학습', handler: (e) => {
        const n = Number(e.key);
        if (phase === 'answering') { digitHandler.current?.(n); return; }
        if (phase === 'submitted' && !unrated && n >= 1 && n <= 4) { rate(n as 1 | 2 | 3 | 4); return; }
        return false;
      } },
      { keys: 'Enter', description: '답안 제출 / 다음', group: '학습', handler: () => {
        if (phase === 'answering') { if (typing) return false; submit(); return; }
        if (phase === 'submitted') { if (unrated) { advanceUnrated(); return; } return false; } // Enter never rates by accident
        if (phase === 'rated') { next(); return; }
        return false;
      } },
      { keys: 'Enter', mod: 'ctrlOrMeta', allowInEditable: true, description: '제출 (입력창 안에서)', group: '학습', handler: () => (phase === 'answering' ? (submit(), undefined) : false) },
      { keys: ' ', description: phase === 'answering' ? '정답 공개 (답 없이)' : '해설 펼치기 / 접기', group: '학습', handler: () => {
        if (phase === 'answering') { reveal(); return; }
        setShowExplanation((v) => !v);
      } },
      { keys: 'e', description: '해설 토글', group: '학습', handler: () => (phase === 'answering' ? false : (setShowExplanation((v) => !v), undefined)) },
      { keys: 'r', description: '이전 응답 보기 / 접기', group: '학습', handler: () => (phase === 'answering' ? false : (setShowPrevious((v) => !v), undefined)) },
      { keys: 'n', description: '다음 문제 (평가 후)', group: '학습', handler: () => (phase === 'rated' ? (next(), undefined) : phase === 'submitted' && unrated ? (advanceUnrated(), undefined) : false) },
      { keys: 'ArrowLeft', description: '이전 문제', group: '학습', handler: (e) => (ownsArrowKeys(e.target) ? false : (goTo(index - 1), undefined)) },
      { keys: 'ArrowRight', description: '다음 문제 (풀지 않고 이동)', group: '학습', handler: (e) => (ownsArrowKeys(e.target) ? false : (goTo(index + 1), undefined)) },
      { keys: 'g', description: '번호로 문제 이동', group: '학습', handler: () => { jumpInput.current?.focus(); } },
      // In a text field Cmd/Ctrl+Z stays the browser's text undo once anything was entered on this card; an
      // untouched field (auto-focused right after rating) has nothing to undo, so it goes back to the last rating.
      { keys: 'z', mod: 'ctrlOrMeta', allowInEditable: true, description: '이전 문제로 돌아가 다시 평가', group: '학습', handler: (e) => {
        if (e.shiftKey || unrated) return false;
        if (isEditableTarget(e.target) && (answer !== null || ((e.target as HTMLInputElement).value ?? '') !== '')) return false;
        undo();
      } },
      { keys: 'u', description: '이전 평가 다시 하기', group: '학습', handler: () => (unrated ? false : (undo(), undefined)) },
      { keys: 'h', description: '힌트 보기', group: '학습', handler: () => (item?.hasHint && phase === 'answering' ? (void showHint(), undefined) : false) },
      { keys: 'm', description: '메모 작성 (이번 회차)', group: '학습', handler: () => (isBrowse ? false : (setNotesFocus((n) => n + 1), undefined)) },
      { keys: 'f', description: '문제 표시 / 해제', group: '학습', handler: () => (item ? (cardMut.mutate({ action: item.card.flagged ? 'unflag' : 'flag' }), undefined) : false) },
      { keys: 'i', description: '카드 정보', group: '학습', handler: () => setShowInfo((v) => !v) },
      { keys: 'v', description: '메타데이터 모두 가리기 / 보이기', group: '학습', handler: () => { meta.toggleAll(); } },
      { keys: 'b', description: '서술형 모범답안: 기본 / 문장별 배점', group: '학습', handler: () => (item?.type === 'essay' && phase !== 'answering' ? (essayView.toggle(), undefined) : false) },
      { keys: 's', description: '건너뛰기 (내일까지 묻기)', group: '학습', handler: () => (item && !unrated ? (cardMut.mutate({ action: 'bury' }), undefined) : false) },
      { keys: 'Escape', allowInEditable: true, description: '입력창 나가기 / 닫기', group: '학습', handler: (e) => {
        // Leaving the answer field hands ←/→ back to card navigation.
        if (isEditableTarget(e.target) && e.target instanceof HTMLElement && studyRoot.current?.contains(e.target)) { e.target.blur(); return; }
        return showInfo ? (setShowInfo(false), undefined) : false;
      } },
    ],
    shortcutsOn && !finished && !!item,
  );
  // From the summary, step back into the session.
  useShortcuts(
    'study',
    [
      { keys: 'ArrowLeft', description: '마지막 문제로', group: '학습', handler: () => { goTo(items.length - 1); } },
      { keys: 'z', mod: 'ctrlOrMeta', description: '마지막 문제로 돌아가 다시 평가', group: '학습', handler: (e) => (e.shiftKey || unrated ? false : (undo(), undefined)) },
      { keys: 'u', description: '마지막 평가 다시 하기', group: '학습', handler: () => (unrated ? false : (undo(), undefined)) },
    ],
    shortcutsOn && finished && items.length > 0,
  );

  if (opened.isError) return <div className="mx-auto max-w-[840px]"><ErrorState message={(opened.error as Error).message} onRetry={() => opened.refetch()} /></div>;
  if (!baseItems || !queueMeta) return <LoadingState label="학습할 문항을 준비하는 중…" className="mx-auto min-h-64 max-w-[840px]" />;
  if (finished || !item) return <SessionSummary params={params} done={done} queue={queueMeta} empty={!baseItems.length} onBack={items.length ? () => goTo(items.length - 1) : undefined} onUndo={!unrated && history.length ? undo : undefined} undoing={undoMut.isPending} shortcuts={shortcutsOn} onRestart={restart} />;

  const progress = done.length;
  const total = items.length;

  return (
    <div ref={studyRoot} className="mx-auto w-full max-w-[840px] scroll-mt-16" data-study-root data-testid="study-screen" data-phase={phase} data-type={item.type} data-round={item.reviewRound} data-question-id={item.questionId}>
      <StudyRunner done={progress} total={total} />
      {/* progress strip */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
        {queueMeta?.deck || params.subject ? <MetaChip k="subject" label={queueMeta?.deck ? '덱' : '과목'} control={metaControl} testId="meta-subject" className="font-medium text-ink"><span>{queueMeta?.deck?.title ?? `과목: ${params.subject}`}</span></MetaChip> : <span className="font-medium text-ink" data-testid="meta-subject">모든 덱</span>}
        <Badge tone={unrated ? 'warn' : 'neutral'}>{MODE_LABEL[params.mode]}</Badge>
        <span className="tabular">{progress} / {total} 완료</span>
        <span className="flex items-center gap-1" data-testid="session-chip">
          {session?.resumed ? <Tooltip content="새로고침·다른 탭·다른 기기에서 같은 학습을 열면 이 세션을 이어서 합니다 (6시간 동안)."><span className="text-ink-2">이어서 학습 중</span></Tooltip> : null}
          <button type="button" onClick={() => setConfirmRestart(true)} className="-mx-1 min-h-8 rounded px-1 hover:bg-muted hover:text-ink" data-testid="new-session-btn">새 세션</button>
        </span>
        {params.mode === 'scheduled' ? <span className="tabular">오늘 복습 {queueMeta?.counts.reviewedToday ?? 0} / 목표 {settings.dailyReviewGoal}</span> : null}
        {lastRated?.rating && phase === 'answering' ? (
          <button type="button" onClick={undo} disabled={undoMut.isPending} className="-mx-1 flex min-h-8 items-center gap-1 rounded px-1 tabular hover:bg-muted hover:text-ink" data-testid="last-rating" aria-label={`직전 평가 ${RATINGS[lastRated.rating - 1]!.ko}: 되돌리고 다시 평가`}>
            직전 <span className={cn('font-medium', RATINGS[lastRated.rating - 1]!.cls.split(' ')[1])}>{RATINGS[lastRated.rating - 1]!.ko}</span>{lastRated.interval ? ` · ${lastRated.interval}` : ''}
            <Undo2 className="h-3.5 w-3.5" aria-hidden /><kbd className="kbd" aria-hidden>⌘Z</kbd>
          </button>
        ) : null}
        <span className="ml-auto flex items-center gap-1"><kbd className="kbd">?</kbd> 단축키</span>
      </div>
      <StudyNav ref={jumpInput} cells={cells} index={index} onGo={goTo} disabled={busy} shortcuts={shortcutsOn} />

      <article className="space-y-5" key={`${item.questionId}:${item.reviewRound}`}>
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <QuestionPrompt
            question={item.question}
            meta={metaControl}
            extra={<>
              <span className="inline-flex items-center gap-1.5">
                <MetaChip k="round" label="회차" control={metaControl} testId="meta-round">
                  <AttemptCounters session={sessionAttempt} today={item.reviewsTodayBefore + 1} total={item.reviewRound} />
                  <span className="ml-3">{item.card.status === 'NEW' ? '새 카드' : item.card.status === 'REVIEW' ? '복습' : '학습 중'}</span>
                </MetaChip>
                {roundHidden ? null : <AttemptCountersHelp />}
              </span>
              {item.noteCount ? <span>메모 {item.noteCount}</span> : null}
            </>}
          />
          <div className="flex shrink-0 items-center gap-1">
            <MetaMaskMenu mask={meta.mask} revealOnAnswer={meta.revealOnAnswer} onToggle={meta.toggle} onSetAll={meta.setAll} onSetRevealOnAnswer={meta.setRevealOnAnswer} shortcut={shortcutsOn ? 'V' : undefined} />
            <Tooltip content={<>{item.card.flagged ? '표시 해제' : '문제 표시'} <kbd className="kbd ml-1">F</kbd></>}>
              <Button loading={cardMut.isPending} variant="ghost" size="iconSm" aria-label={item.card.flagged ? '표시 해제' : '문제 표시'} aria-pressed={item.card.flagged} onClick={() => cardMut.mutate({ action: item.card.flagged ? 'unflag' : 'flag' })} className={cn(item.card.flagged && 'text-warn')}>
                <Flag className="h-4 w-4" fill={item.card.flagged ? 'currentColor' : 'none'} />
              </Button>
            </Tooltip>
            <Tooltip content={<>카드 정보 <kbd className="kbd ml-1">I</kbd></>}>
              <Button variant="ghost" size="iconSm" aria-label="카드 정보" onClick={() => setShowInfo(true)}><Info className="h-4 w-4" /></Button>
            </Tooltip>
          </div>
        </header>

        {hint ? <div className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn-soft/50 px-3 py-2 text-sm"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warn" /><Markdown className="prose-sm">{hint}</Markdown></div> : null}

        <QuestionRenderer
          question={item.question}
          value={answer}
          onChange={setAnswer}
          onSubmit={submit}
          phase={phaseForRenderer}
          grade={grade?.grade ?? null}
          answerKey={grade?.answerKey ?? null}
          shuffleSeed={viewSeed}
          showKeyHints={shortcutsOn}
          registerDigitHandler={registerDigitHandler}
        />

        {phase === 'answering' ? (
          <StudyActions><div className="study-answer-actions grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap" data-submit-on-right={settings.mobileSubmitOnRight ?? false}>
            <Button loading={gradeMut.isPending && !revealedBeforeAnswer} loadingLabel="채점 중…" variant="primary" size="lg" onClick={submit} disabled={gradeMut.isPending} kbd={typing ? '⌘⏎' : '⏎'} data-testid="submit-btn">제출</Button>
            <Button loading={gradeMut.isPending && revealedBeforeAnswer} loadingLabel="확인 중…" size="lg" onClick={reveal} disabled={gradeMut.isPending} kbd="Space" data-testid="reveal-btn"><Eye className="h-4 w-4" /> 정답 공개</Button>
            {item.hasHint ? <Button loading={hintPending} loadingLabel="힌트 확인…" disabled={gradeMut.isPending} variant="ghost" onClick={() => void showHint()} kbd="H" className="max-md:min-h-9 max-md:h-9"><Lightbulb className="h-4 w-4" /> 힌트</Button> : null}
            {!unrated ? <Button loading={cardMut.isPending && cardMut.variables?.action === 'bury'} variant="ghost" onClick={() => cardMut.mutate({ action: 'bury' })} kbd="S" className="max-md:min-h-9 max-md:h-9 sm:ml-auto"><SkipForward className="h-4 w-4" /> 내일로</Button> : null}
          </div></StudyActions>
        ) : null}

        {phase !== 'answering' && !grade ? <LoadingState label="결과를 불러오는 중…" className="min-h-24" /> : null}
        {phase !== 'answering' && grade ? (
          <div className="space-y-4" data-testid="result">
            <div className="flex flex-wrap items-center gap-3">
              <Verdict grade={grade.grade} revealedBeforeAnswer={revealedBeforeAnswer} />
              <div className="ml-auto flex flex-wrap items-center gap-1">
                <CopyQuestionButtons item={item} answer={answer} grade={revealedBeforeAnswer ? null : grade.grade} revealedBeforeAnswer={revealedBeforeAnswer} hintUsed={hintUsed} shortcuts={shortcutsOn} viewSeed={viewSeed} />
                <Button size="sm" variant="ghost" onClick={() => setShowPrevious((v) => !v)} kbd="R" aria-expanded={showPrevious} aria-controls="previous-responses" data-testid="previous-toggle">
                  <History className="h-4 w-4" /> {showPrevious ? '이전 응답 접기' : '이전 응답 보기'}{previous.query.isSuccess ? <span className="tabular text-ink-3">{previous.items.length}</span> : null}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowExplanation((v) => !v)} kbd="E">{showExplanation ? '해설 접기' : '해설 보기'}</Button>
              </div>
            </div>
            {showPrevious ? <PreviousResponsesPanel id="previous-responses" question={item.question} answerKey={grade.answerKey ?? null} items={previous.items} loading={previous.query.isPending} error={previous.query.isError} onRetry={() => void previous.query.refetch()} hideRound={roundHidden} /> : null}
            <ExplanationPanel explanation={grade.explanation} source={item.question.source} meta={metaControl} open={showExplanation} />
            {!isBrowse ? <LlmLinksPanel questionId={item.questionId} round={item.reviewRound} hideRound={roundHidden} /> : null}
            {phase === 'submitted' ? (
              <StudyActions>{unrated ? (
                <div className="flex items-center gap-3 md:flex-wrap md:gap-2">
                  <span className="min-w-0 flex-1 text-[12px] text-ink-3 md:flex-initial" data-testid="study-mode-notice">{isBrowse ? '구경 모드: 학습 기록과 FSRS 스케줄에 남지 않습니다.' : '연습 모드: FSRS 스케줄은 바뀌지 않습니다.'}</span>
                  <Button className="shrink-0 md:order-first" variant="primary" size="lg" onClick={advanceUnrated} kbd="N" data-testid="next-btn">다음 <ArrowRight className="h-4 w-4" /></Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[13px] text-ink-2">얼마나 잘 떠올렸나요? 정오답과 무관하게 <strong>회상 난이도</strong>로 평가하세요.</p>
                  <RatingBar preview={item.preview} onRate={rate} disabled={reviewMut.isPending} pending={pendingRating} blocked={easyBlocked ? { ratings: [4], reason: easyBlockedReason } : undefined} />
                  {easyBlocked ? <p className="text-[12px] text-ink-3" data-testid="easy-blocked-note">{easyBlockedReason} · <Link href="/settings" className="underline underline-offset-2 hover:text-ink">설정에서 끄기</Link></p> : null}
                </div>
              )}</StudyActions>
            ) : null}
            {phase === 'rated' && cardKey && memos[cardKey]?.remote && memos[cardKey]?.rating ? (
              <p className="rounded-md border border-line bg-muted/50 px-3 py-2 text-[13px] text-ink-2" data-testid="remote-rated">
                {memos[cardKey]!.remote === 'device' ? '다른 기기에서' : '다른 학습 화면에서'} <strong className={RATINGS[memos[cardKey]!.rating! - 1]!.cls.split(' ')[1]}>‘{RATINGS[memos[cardKey]!.rating! - 1]!.ko}’</strong>{RATING_PARTICLE[memos[cardKey]!.rating!]} 평가했습니다. 바꾸려면 ‘다시 평가’를 누르세요.
              </p>
            ) : null}
            {phase === 'rated' ? (
              <StudyActions><div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="lg" onClick={() => next()} kbd="N" data-testid="next-btn">다음 문제 <ArrowRight className="h-4 w-4" /></Button>
                <Button loading={undoMut.isPending} loadingLabel="평가 복구 중…" variant="ghost" onClick={undo} kbd="⌘Z" data-testid="undo-btn"><Undo2 className="h-4 w-4" /> 다시 평가</Button>
                {cardKey && memos[cardKey]?.rating ? (
                  <span className="text-[13px] text-ink-3 tabular sm:ml-auto" data-testid="given-rating">
                    평가 <span className={cn('font-medium', RATINGS[memos[cardKey]!.rating! - 1]!.cls.split(' ')[1])}>{RATINGS[memos[cardKey]!.rating! - 1]!.ko}</span>{memos[cardKey]!.interval ? ` · ${memos[cardKey]!.interval}` : ''}
                  </span>
                ) : null}
              </div></StudyActions>
            ) : null}
          </div>
        ) : null}

        {!isBrowse ? <NotesPanel questionId={item.questionId} round={item.reviewRound} hideRound={roundHidden} focusSignal={notesFocus} defaultOpen={false} /> : null}

      </article>

      <Dialog open={confirmRestart} onOpenChange={setConfirmRestart}>
        <DialogContent title="새 세션을 시작할까요?" description="지금 세션은 끝나고 문항을 새로 뽑습니다. 이미 한 평가·메모·기록은 그대로 남습니다. 다른 기기에서 이 학습을 열면 새 세션으로 이어집니다.">
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmRestart(false)}>취소</Button>
            <Button variant="primary" onClick={restart} data-testid="confirm-new-session">새로 시작</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent title="카드 정보" description={`${meta.mask.subject && !metaControl.revealed ? '덱 (가려짐)' : item.deck.title} · ${meta.mask.source && !metaControl.revealed ? 'ID (가려짐)' : item.externalId}`}>
          <CardInfoTable card={item.card} round={item.reviewRound} hideRound={roundHidden} />
          <div className="mt-4 flex flex-wrap gap-2">
            {!unrated ? <Button size="sm" onClick={() => { setShowInfo(false); cardMut.mutate({ action: 'suspend' }); }}><PauseCircle className="h-4 w-4" /> 이 문제 보류</Button> : null}
            <Link href={`/decks/${item.deck.id}?q=${encodeURIComponent(item.externalId)}`} className="inline-flex h-8 items-center rounded-md border border-line px-2.5 text-[13px]">덱에서 보기</Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionSummary({ params, done, queue, empty, onRestart, onBack, onUndo, undoing, shortcuts }: { params: StudyParams; done: Done[]; queue: Omit<Queue, 'items'>; empty: boolean; onRestart: () => void; onBack?: () => void; onUndo?: () => void; undoing?: boolean; shortcuts?: boolean }) {
  const gradable = done.filter((d) => d.isCorrect !== null);
  const correct = gradable.filter((d) => d.isCorrect).length;
  const counts = [1, 2, 3, 4].map((r) => done.filter((d) => d.rating === r).length);
  const nothing = empty;
  const browse = params.mode === 'browse';
  return (
    <div className="mx-auto max-w-[840px]" data-testid="session-summary">
      <h1 className="text-xl font-semibold">{nothing ? (browse ? '볼 문제가 없습니다' : params.mode === 'new' ? '아직 안 본 새 카드가 없습니다' : '지금은 학습할 카드가 없습니다') : browse ? '구경 완료' : '세션 완료'}</h1>
      {nothing && browse ? null : nothing && params.mode === 'new' ? (
        <p className="mt-2 text-sm text-ink-2">이 범위의 카드는 모두 한 번 이상 학습했습니다. 복습은 ‘학습’에서 예정된 날에 이어집니다.</p>
      ) : nothing ? (
        <div className="mt-2 space-y-2 text-sm text-ink-2">
          <p>예정된 카드가 없거나 오늘의 상한에 도달했습니다. {queue.nextLearningDueAt ? `다음 학습 카드는 ${new Date(queue.nextLearningDueAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}에 예정되어 있습니다.` : ''}</p>
          <ul className="list-disc pl-5 text-[13px] text-ink-3">
            <li>오늘 새 카드 {queue.counts.newIntroducedToday}개 학습 (상한 {queue.counts.newIntroducedToday + queue.counts.newBudget})</li>
            <li>남은 새 카드 {queue.counts.newAvailable}개 · 보류 {queue.counts.suspended}개 · 묻어둠 {queue.counts.buried}개</li>
          </ul>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div><div className="text-[12px] text-ink-3">완료</div><div className="text-2xl font-semibold tabular">{done.length}</div></div>
          <div><div className="text-[12px] text-ink-3">정답률 (자동채점 {gradable.length}문항)</div><div className="text-2xl font-semibold tabular">{gradable.length ? `${Math.round((correct / gradable.length) * 100)}%` : '—'}</div></div>
          {browse ? <div><div className="text-[12px] text-ink-3">기록</div><div className="text-sm">남기지 않음 (구경 모드)</div></div> : <div><div className="text-[12px] text-ink-3">평가 분포</div><div className="text-sm tabular">다시 {counts[0]} · 어려움 {counts[1]} · 보통 {counts[2]} · 쉬움 {counts[3]}</div></div>}
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        {onBack ? <Button variant="ghost" onClick={onBack} kbd={shortcuts ? '←' : undefined} data-testid="summary-back"><ArrowLeft className="h-4 w-4" /> 마지막 문제로</Button> : null}
        {onUndo ? <Button variant="ghost" loading={undoing} loadingLabel="평가 복구 중…" onClick={onUndo} kbd={shortcuts ? '⌘Z' : undefined} data-testid="summary-undo"><Undo2 className="h-4 w-4" /> 마지막 평가 다시 하기</Button> : null}
        {(params.mode === 'scheduled' || params.mode === 'new') && !nothing ? <Button variant="primary" onClick={onRestart}>더 학습하기</Button> : null}
        {/* new cards the daily limit left out of the scheduled queue */}
        {params.mode === 'scheduled' && queue.counts.newAvailable > queue.counts.newBudget ? <Link href={`/study/${params.scope}?mode=new${params.subject ? `&subject=${encodeURIComponent(params.subject)}` : ''}`} className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-sm" data-testid="summary-new-only">새 카드만 마저 보기 ({queue.counts.newAvailable - queue.counts.newBudget})</Link> : null}
        {browse && !nothing ? <Button variant="primary" onClick={onRestart}>처음부터 다시</Button> : null}
        {nothing && !browse ? <Link href={`/study/${params.scope}?mode=cram${params.subject ? `&subject=${encodeURIComponent(params.subject)}` : ''}`} className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accent-ink">전체 훑기 (cram)</Link> : null}
        {nothing && !browse && params.scope !== 'all' ? <Link href={`/study/${params.scope}?mode=browse`} className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-sm" data-testid="browse-link">구경하기 (기록 없음)</Link> : null}
        <Link href={params.scope === 'all' ? '/' : `/decks/${params.scope}`} className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-sm">{params.scope === 'all' ? '대시보드로' : '덱으로 돌아가기'}</Link>
        <Link href="/insights" className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-sm">통계 보기</Link>
      </div>
    </div>
  );
}
