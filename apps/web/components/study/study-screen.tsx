'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Eye, Flag, Info, Lightbulb, PauseCircle, SkipForward, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { Markdown } from '@/components/questions/markdown';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AnswerPayload } from '@recall/contracts';
import { api, ApiRequestError, type GradeResponse, type Queue, type QueueItem, type ReviewResponse } from '@/lib/api';
import { useShortcuts } from '@/lib/shortcuts/provider';
import { cn, uid } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tooltip } from '@/components/ui/tooltip';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { QuestionPrompt, QuestionRenderer } from '@/components/questions/question-renderer';
import type { Phase } from '@/components/questions/types';
import { ExplanationPanel, Verdict } from './explanation-panel';
import { RATINGS, RatingBar } from './rating-bar';
import { NotesPanel } from './notes-panel';
import { CardInfoTable } from './card-info';
import { CopyQuestionButtons } from './copy-question';
import { MetaMaskMenu, useMetaMask } from './meta-mask-menu';
import { MetaChip } from '@/components/questions/masked-chip';
import type { MetaControl } from '@/components/questions/meta-mask';
import { useSettings } from '@/components/layout/settings-context';

export interface StudyParams {
  scope: string; // deck id or 'all'
  mode: 'scheduled' | 'cram' | 'mistakes' | 'flagged' | 'practice' | 'browse';
  subject?: string;
  tags?: string[];
  types?: string[];
  difficultyMin?: number;
  difficultyMax?: number;
  limit?: number;
}

type CardState = 'answering' | 'submitted' | 'rated';

interface Snapshot { items: QueueItem[]; queue: Queue; index: number; done: Done[]; extraItems: QueueItem[]; skipped: string[]; savedAt: number }
const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;
function readSnapshot(key: string): Snapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    if (!snap.items || Date.now() - snap.savedAt > SNAPSHOT_TTL_MS) { window.sessionStorage.removeItem(key); return null; }
    return snap;
  } catch { return null; }
}
function writeSnapshot(key: string, snap: Snapshot) {
  try { window.sessionStorage.setItem(key, JSON.stringify(snap)); } catch { /* storage unavailable or full */ }
}
function clearSnapshot(key: string) {
  try { window.sessionStorage.removeItem(key); } catch { /* ignore */ }
}

interface Done { questionId: string; rating?: number; isCorrect: boolean | null; reviewId?: string }

const MODE_LABEL: Record<StudyParams['mode'], string> = { scheduled: '예정된 학습', cram: '전체 훑기 (cram)', mistakes: '틀린 문제', flagged: '표시한 문제', practice: '연습 (스케줄 영향 없음)', browse: '구경 (기록 없음)' };

function queueUrl(p: StudyParams) {
  const u = new URLSearchParams();
  if (p.scope !== 'all') u.set('deckId', p.scope);
  if (p.subject) u.set('subject', p.subject);
  u.set('mode', p.mode);
  if (p.tags?.length) u.set('tags', p.tags.join(','));
  if (p.types?.length) u.set('types', p.types.join(','));
  if (p.difficultyMin) u.set('difficultyMin', String(p.difficultyMin));
  if (p.difficultyMax) u.set('difficultyMax', String(p.difficultyMax));
  u.set('limit', String(p.limit ?? (p.mode === 'browse' ? 1000 : 200)));
  return `/study/queue?${u.toString()}`;
}

export function StudyScreen({ params }: { params: StudyParams }) {
  const qc = useQueryClient();
  const { settings } = useSettings();
  const meta = useMetaMask();
  // Card whose answer is open: the reveal-on-answer option shows hidden metadata only for exactly this card,
  // so the next card never flashes its metadata even for the frame before the phase resets.
  const [metaRevealedFor, setMetaRevealedFor] = useState<string | null>(null);
  const storageKey = `rs-study:${JSON.stringify(params)}`;
  // Snapshot is read only after mount (sessionStorage is client-only; reading it during the first render
  // would make the client tree differ from the server-rendered skeleton → hydration mismatch).
  const [restored, setRestored] = useState<Snapshot | null | undefined>(undefined);
  // The queue is fetched once per session and then frozen: refetches (reconnect, focus, HMR) must never
  // reorder or drop cards under the learner. A reload within 6 hours resumes from the saved snapshot.
  const queue = useQuery({
    queryKey: ['queue', params],
    queryFn: () => api<Queue>(queueUrl(params)),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: restored === null,
  });
  const [baseItems, setBaseItems] = useState<QueueItem[] | null>(null);
  const [queueMeta, setQueueMeta] = useState<Queue | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<CardState>('answering');
  const [answer, setAnswer] = useState<AnswerPayload | null>(null);
  const [grade, setGrade] = useState<GradeResponse | null>(null);
  const [revealedBeforeAnswer, setRevealedBeforeAnswer] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(true);
  const [done, setDone] = useState<Done[]>([]);
  const [lastReview, setLastReview] = useState<{ reviewId: string; questionId: string; index: number; rating: 1 | 2 | 3 | 4; interval: string | null } | null>(null);
  const [pendingRating, setPendingRating] = useState<1 | 2 | 3 | 4 | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [notesFocus, setNotesFocus] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [extraItems, setExtraItems] = useState<QueueItem[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  useEffect(() => {
    const snap = readSnapshot(storageKey);
    setRestored(snap);
    if (snap) {
      setBaseItems(snap.items);
      setQueueMeta(snap.queue);
      setIndex(snap.index);
      setDone(snap.done);
      setExtraItems(snap.extraItems);
      setSkipped(new Set(snap.skipped));
    }
  }, [storageKey]);
  useEffect(() => {
    if (queue.data && !baseItems) {
      setBaseItems(queue.data.items);
      setQueueMeta(queue.data);
    }
  }, [queue.data, baseItems]);
  const startedAt = useRef<number>(0);
  const digitHandler = useRef<((n: number) => void) | null>(null);
  const submitLock = useRef(false);
  const [shuffleSeed] = useState(() => uid());

  // Patch one card's state in the frozen queue (base + re-queued copies). The react-query cache is not the
  // source of truth once the queue is frozen, so updates must land here or the next rating sends a stale version.
  const patchCard = useCallback((questionId: string, patch: Partial<QueueItem['card']>) => {
    const apply = (list: QueueItem[]) => list.map((i) => (i.questionId === questionId ? { ...i, card: { ...i.card, ...patch } } : i));
    setBaseItems((b) => (b ? apply(b) : b));
    setExtraItems((x) => apply(x));
  }, []);

  // A resumed snapshot carries the card versions from when the queue was first fetched. Cards reviewed or undone
  // since then (another tab, an undo before the reload) would 409 on rating, so re-sync their state once on resume.
  useEffect(() => {
    if (!restored) return;
    let cancelled = false;
    api<Queue>(queueUrl(params))
      .then((fresh) => {
        if (cancelled) return;
        const byId = new Map(fresh.items.map((i) => [i.questionId, i.card]));
        const sync = (list: QueueItem[]) => list.map((i) => { const c = byId.get(i.questionId); return c && c.version !== i.card.version ? { ...i, card: c } : i; });
        setBaseItems((b) => (b ? sync(b) : b));
        setExtraItems((x) => sync(x));
        setQueueMeta((m) => (m ? { ...m, counts: fresh.counts } : m));
      })
      .catch(() => { /* offline: stale versions self-heal on the next 409 */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

  const items = useMemo(() => [...(baseItems ?? []), ...extraItems].filter((i) => !skipped.has(i.questionId)), [baseItems, extraItems, skipped]);
  const item = items[index] ?? null;
  const finished = !!baseItems && (items.length === 0 || index >= items.length);
  // persist progress so a reload (or dev hot reload) resumes at the same card
  useEffect(() => {
    if (!baseItems || !queueMeta) return;
    if (finished) { clearSnapshot(storageKey); return; }
    writeSnapshot(storageKey, { items: baseItems, queue: queueMeta, index, done, extraItems, skipped: [...skipped], savedAt: Date.now() });
  }, [storageKey, baseItems, queueMeta, index, done, extraItems, skipped, finished]);
  const isPractice = params.mode === 'practice';
  // Browse: look at every question (limits, due dates, suspend/bury ignored); nothing is recorded, no rating step.
  const isBrowse = params.mode === 'browse';
  const unrated = isPractice || isBrowse;

  // session bookkeeping
  useEffect(() => {
    if (!baseItems || sessionId || restored === undefined || restored || isBrowse) return;
    api<{ id: string }>('/study/sessions', { method: 'POST', json: { scope: params.scope, subject: params.subject, mode: params.mode, queueSize: baseItems.length } })
      .then((s) => setSessionId(s.id))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseItems]);
  useEffect(() => {
    if (finished && sessionId) api(`/study/sessions/${sessionId}/end`, { method: 'PATCH' }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  useEffect(() => {
    if (startedAt.current === 0) startedAt.current = Date.now();
  }, []);

  const resetCard = useCallback(() => {
    setPhase('answering');
    setMetaRevealedFor(null);
    setAnswer(null);
    setGrade(null);
    setRevealedBeforeAnswer(false);
    setHintUsed(false);
    setHint(null);
    setShowExplanation(true);
    setPendingRating(null);
    startedAt.current = Date.now();
    submitLock.current = false;
  }, []);

  const registerDigitHandler = useCallback((fn: ((n: number) => void) | null) => { digitHandler.current = fn; }, []);

  const gradeMut = useMutation({
    mutationFn: async (payload: AnswerPayload | null) => {
      if (!item) throw new Error('no item');
      const res = await api<GradeResponse>(`/questions/${item.questionId}/grade`, { method: 'POST', json: { answerPayload: payload } });
      if (isPractice) await api('/study/practice', { method: 'POST', json: { questionId: item.questionId, sessionId: sessionId ?? undefined, answerPayload: payload, elapsedMs: Date.now() - startedAt.current } }).catch(() => {});
      return res;
    },
    onSuccess: (res) => {
      setGrade(res);
      setPhase('submitted');
      if (item) setMetaRevealedFor(`${item.questionId}:${item.reviewRound}`);
    },
    onError: (e: Error) => { submitLock.current = false; toast.error('채점에 실패했습니다', { description: e.message }); },
  });

  const hasAnswer = (p: AnswerPayload | null): boolean => {
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
  };

  const submit = useCallback(() => {
    if (phase !== 'answering' || submitLock.current || !item) return;
    if (!hasAnswer(answer)) { toast('답안을 입력한 뒤 제출하세요', { description: 'Space 키로 답을 바로 공개할 수도 있습니다.' }); return; }
    submitLock.current = true;
    gradeMut.mutate(answer);
  }, [phase, item, answer, gradeMut]);

  const reveal = useCallback(() => {
    if (phase !== 'answering' || submitLock.current || !item) return;
    submitLock.current = true;
    setRevealedBeforeAnswer(true);
    gradeMut.mutate(hasAnswer(answer) ? answer : null);
  }, [phase, item, answer, gradeMut]);

  const next = useCallback(() => {
    resetCard();
    setIndex((i) => i + 1);
  }, [resetCard]);

  // practice/browse have no rating step: count the answer and move on
  const advanceUnrated = useCallback(() => {
    if (!item || !grade) return;
    setDone((d) => [...d, { questionId: item.questionId, isCorrect: revealedBeforeAnswer ? null : grade.grade.isCorrect }]);
    next();
  }, [item, grade, revealedBeforeAnswer, next]);

  const reviewMut = useMutation({
    mutationFn: async (rating: 1 | 2 | 3 | 4) => {
      if (!item) throw new Error('no item');
      const key = uid();
      const isCorrect = revealedBeforeAnswer ? null : (grade?.grade.isCorrect ?? null);
      return api<ReviewResponse>('/reviews', {
        method: 'POST',
        json: { questionId: item.questionId, rating, idempotencyKey: key, sessionId: sessionId ?? undefined, elapsedMs: Date.now() - startedAt.current, isCorrect, revealedBeforeAnswer, hintUsed, answerPayload: answer, expectedVersion: item.card.version },
      });
    },
    onSuccess: (res, rating) => {
      if (!item) return;
      setDone((d) => [...d, { questionId: item.questionId, rating, isCorrect: grade?.grade.isCorrect ?? null, reviewId: res.review.id }]);
      setLastReview({ reviewId: res.review.id, questionId: item.questionId, index, rating, interval: item.preview ? item.preview[(['again', 'hard', 'good', 'easy'] as const)[rating - 1]!].interval : null });
      setPhase('rated');
      void qc.invalidateQueries({ queryKey: ['notes', item.questionId] });
      // Again/Hard on a learning step re-queues the card at the end of this session so it is seen again today.
      if (rating === 1 && (res.card.status === 'LEARNING' || res.card.status === 'RELEARNING') && !isPractice) {
        setExtraItems((x) => [...x, { ...item, card: { ...item.card, version: res.card.version, status: res.card.status }, reviewRound: res.reviewRound + 1, preview: null }]);
      }
      if (settings.autoAdvanceAfterRating) next();
    },
    onError: (e: Error, rating) => {
      setPendingRating(null);
      if (e instanceof ApiRequestError && e.status === 409 && item) {
        // Our copy of the card is stale (undo, another tab, a reset). Take the server's version so the next
        // rating goes through, and offer to re-send this one with a single click.
        const current = (e.details as { currentVersion?: number } | undefined)?.currentVersion;
        if (typeof current === 'number') patchCard(item.questionId, { version: current });
        toast.error('카드 상태가 다른 곳에서 바뀌어 평가를 저장하지 못했습니다', {
          description: '최신 상태로 맞췄습니다. 평가를 다시 저장할 수 있습니다.',
          action: typeof current === 'number' ? { label: '다시 저장', onClick: () => { setPendingRating(rating); reviewMut.mutate(rating); } } : undefined,
        });
      } else toast.error('평가를 저장하지 못했습니다', { description: e.message });
    },
  });

  const rate = useCallback((rating: 1 | 2 | 3 | 4) => {
    if (phase !== 'submitted' || reviewMut.isPending || pendingRating) return;
    setPendingRating(rating);
    reviewMut.mutate(rating);
  }, [phase, reviewMut, pendingRating]);

  const undoMut = useMutation({
    mutationFn: (reviewId: string) => api<ReviewResponse>(`/reviews/${reviewId}/undo`, { method: 'POST' }),
    onSuccess: (res) => {
      if (!lastReview) return;
      setDone((d) => d.filter((x) => x.reviewId !== lastReview.reviewId));
      setExtraItems((x) => x.filter((i) => !(i.questionId === lastReview.questionId && i.reviewRound === res.reviewRound + 1)));
      setIndex(lastReview.index);
      resetCard();
      // keep the card's new version (undo bumps it too) so the next rating does not conflict
      const { stateJson, ...card } = res.card;
      void stateJson;
      patchCard(lastReview.questionId, card);
      void qc.invalidateQueries({ queryKey: ['notes', lastReview.questionId] });
      setLastReview(null);
      toast.success('마지막 평가를 되돌렸습니다', { description: 'FSRS 상태와 복습 기록이 이전 스냅샷으로 복구되었습니다.' });
    },
    onError: (e: Error) => toast.error('되돌리지 못했습니다', { description: e.message }),
  });

  const undo = useCallback(() => {
    if (!lastReview || undoMut.isPending) { if (!lastReview) toast('되돌릴 평가가 없습니다'); return; }
    undoMut.mutate(lastReview.reviewId);
  }, [lastReview, undoMut]);

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
        setSkipped((s) => new Set(s).add(item.questionId));
        resetCard();
      }
    },
    onError: (e: Error) => toast.error('처리하지 못했습니다', { description: e.message }),
  });

  const showHint = useCallback(async () => {
    if (!item?.hasHint || phase !== 'answering') return;
    if (!hint) {
      const r = await api<{ hint: string | null }>(`/study/hint/${item.questionId}`);
      setHint(r.hint);
    }
    setHintUsed(true);
  }, [item, hint, phase]);

  const cardKey = item ? `${item.questionId}:${item.reviewRound}` : null;
  const metaControl: MetaControl = { mask: meta.mask, revealed: meta.revealOnAnswer && phase !== 'answering' && cardKey !== null && metaRevealedFor === cardKey, onToggle: meta.toggle };
  const phaseForRenderer: Phase = phase === 'answering' ? 'answering' : revealedBeforeAnswer ? 'revealed' : 'submitted';
  const shortcutsOn = settings.shortcutsEnabled;
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
      { keys: 'n', description: '다음 문제 (평가 후)', group: '학습', handler: () => (phase === 'rated' ? (next(), undefined) : phase === 'submitted' && unrated ? (advanceUnrated(), undefined) : false) },
      { keys: 'u', description: '마지막 평가 되돌리기', group: '학습', handler: () => { undo(); } },
      { keys: 'h', description: '힌트 보기', group: '학습', handler: () => (item?.hasHint && phase === 'answering' ? (void showHint(), undefined) : false) },
      { keys: 'm', description: '메모 작성 (이번 회차)', group: '학습', handler: () => (isBrowse ? false : (setNotesFocus((n) => n + 1), undefined)) },
      { keys: 'f', description: '문제 표시 / 해제', group: '학습', handler: () => (item ? (cardMut.mutate({ action: item.card.flagged ? 'unflag' : 'flag' }), undefined) : false) },
      { keys: 'i', description: '카드 정보', group: '학습', handler: () => setShowInfo((v) => !v) },
      { keys: 'v', description: '메타데이터 모두 가리기 / 보이기', group: '학습', handler: () => { meta.toggleAll(); } },
      { keys: 's', description: '건너뛰기 (내일까지 묻기)', group: '학습', handler: () => (item && !unrated ? (cardMut.mutate({ action: 'bury' }), undefined) : false) },
      { keys: 'Escape', description: '입력창 나가기 / 닫기', group: '학습', handler: () => (showInfo ? (setShowInfo(false), undefined) : false) },
    ],
    shortcutsOn && !finished && !!item,
  );

  if (!baseItems && !queue.isError) return <div className="mx-auto max-w-[840px] space-y-4"><Skeleton className="h-6 w-40" /><Skeleton className="h-40" /><Skeleton className="h-12" /></div>;
  if (queue.isError) return <div className="mx-auto max-w-[840px]"><ErrorState message={(queue.error as Error).message} onRetry={() => queue.refetch()} /></div>;
  if (finished || !item) return <SessionSummary params={params} done={done} queue={queueMeta ?? queue.data!} onRestart={async () => { clearSnapshot(storageKey); setIndex(0); setDone([]); setExtraItems([]); setSkipped(new Set()); resetCard(); setBaseItems(null); setQueueMeta(null); const r = await queue.refetch(); if (r.data) { setBaseItems(r.data.items); setQueueMeta(r.data); } }} />;

  const progress = done.length;
  const total = items.length;

  return (
    <div className="mx-auto w-full max-w-[840px]" data-testid="study-screen" data-phase={phase} data-type={item.type} data-round={item.reviewRound} data-question-id={item.questionId}>
      {/* progress strip */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
        {queueMeta?.deck || params.subject ? <MetaChip k="subject" label={queueMeta?.deck ? '덱' : '과목'} control={metaControl} testId="meta-subject" className="font-medium text-ink"><span>{queueMeta?.deck?.title ?? `과목: ${params.subject}`}</span></MetaChip> : <span className="font-medium text-ink" data-testid="meta-subject">모든 덱</span>}
        <Badge tone={unrated ? 'warn' : 'neutral'}>{MODE_LABEL[params.mode]}</Badge>
        <span className="tabular">{progress} / {total} 완료</span>
        {params.mode === 'scheduled' ? <span className="tabular">오늘 복습 {queueMeta?.counts.reviewedToday ?? 0} / 목표 {settings.dailyReviewGoal}</span> : null}
        {lastReview && phase === 'answering' ? <span className="flex items-center gap-1 tabular" data-testid="last-rating">직전 <span className={cn('font-medium', RATINGS[lastReview.rating - 1]!.cls.split(' ')[1])}>{RATINGS[lastReview.rating - 1]!.ko}</span>{lastReview.interval ? ` · ${lastReview.interval}` : ''} <kbd className="kbd" aria-hidden>U</kbd></span> : null}
        <span className="ml-auto flex items-center gap-1"><kbd className="kbd">?</kbd> 단축키</span>
      </div>
      <div className="mb-5 h-1 w-full overflow-hidden rounded-full bg-sunken" aria-hidden><div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${(progress / Math.max(1, total)) * 100}%` }} /></div>

      <article className="space-y-5" key={`${item.questionId}:${item.reviewRound}`}>
        <header className="flex items-start justify-between gap-3">
          <QuestionPrompt
            question={item.question}
            meta={metaControl}
            extra={<>
              <span>{item.reviewRound}회차</span>
              <span>{item.card.status === 'NEW' ? '새 카드' : item.card.status === 'REVIEW' ? '복습' : '학습 중'}</span>
              {item.noteCount ? <span>메모 {item.noteCount}</span> : null}
            </>}
          />
          <div className="flex shrink-0 items-center gap-1">
            <MetaMaskMenu mask={meta.mask} revealOnAnswer={meta.revealOnAnswer} onToggle={meta.toggle} onSetAll={meta.setAll} onSetRevealOnAnswer={meta.setRevealOnAnswer} shortcut={shortcutsOn ? 'V' : undefined} />
            <Tooltip content={<>{item.card.flagged ? '표시 해제' : '문제 표시'} <kbd className="kbd ml-1">F</kbd></>}>
              <Button variant="ghost" size="iconSm" aria-label={item.card.flagged ? '표시 해제' : '문제 표시'} aria-pressed={item.card.flagged} onClick={() => cardMut.mutate({ action: item.card.flagged ? 'unflag' : 'flag' })} className={cn(item.card.flagged && 'text-warn')}>
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
          shuffleSeed={settings.shuffleChoices ? `${shuffleSeed}:${item.reviewRound}` : null}
          showKeyHints={shortcutsOn}
          registerDigitHandler={registerDigitHandler}
        />

        {phase === 'answering' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="lg" onClick={submit} disabled={gradeMut.isPending} kbd={typing ? '⌘⏎' : '⏎'} data-testid="submit-btn">제출</Button>
            <Button size="lg" onClick={reveal} disabled={gradeMut.isPending} kbd="Space" data-testid="reveal-btn"><Eye className="h-4 w-4" /> 정답 공개</Button>
            {item.hasHint ? <Button variant="ghost" onClick={() => void showHint()} kbd="H"><Lightbulb className="h-4 w-4" /> 힌트</Button> : null}
            {!unrated ? <Button variant="ghost" onClick={() => cardMut.mutate({ action: 'bury' })} kbd="S" className="ml-auto"><SkipForward className="h-4 w-4" /> 내일로</Button> : null}
          </div>
        ) : null}

        {phase !== 'answering' && grade ? (
          <div className="space-y-4" data-testid="result">
            <div className="flex flex-wrap items-center gap-3">
              <Verdict grade={grade.grade} revealedBeforeAnswer={revealedBeforeAnswer} />
              <div className="ml-auto flex flex-wrap items-center gap-1">
                <CopyQuestionButtons item={item} answer={answer} grade={revealedBeforeAnswer ? null : grade.grade} revealedBeforeAnswer={revealedBeforeAnswer} hintUsed={hintUsed} shortcuts={shortcutsOn} />
                <Button size="sm" variant="ghost" onClick={() => setShowExplanation((v) => !v)} kbd="E">{showExplanation ? '해설 접기' : '해설 보기'}</Button>
              </div>
            </div>
            <ExplanationPanel explanation={grade.explanation} source={item.question.source} meta={metaControl} open={showExplanation} />
            {phase === 'submitted' ? (
              unrated ? (
                <div className="flex items-center gap-2">
                  <Button variant="primary" size="lg" onClick={advanceUnrated} kbd="N" data-testid="next-btn">다음 <ArrowRight className="h-4 w-4" /></Button>
                  <span className="text-[12px] text-ink-3">{isBrowse ? '구경 모드: 학습 기록과 FSRS 스케줄에 남지 않습니다.' : '연습 모드: FSRS 스케줄은 바뀌지 않습니다.'}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[13px] text-ink-2">얼마나 잘 떠올렸나요? 정오답과 무관하게 <strong>회상 난이도</strong>로 평가하세요.</p>
                  <RatingBar preview={item.preview} onRate={rate} disabled={reviewMut.isPending} pending={pendingRating} />
                </div>
              )
            ) : null}
            {phase === 'rated' ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="lg" onClick={next} kbd="N" data-testid="next-btn">다음 문제 <ArrowRight className="h-4 w-4" /></Button>
                <Button variant="ghost" onClick={undo} kbd="U"><Undo2 className="h-4 w-4" /> 평가 되돌리기</Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isBrowse ? <NotesPanel questionId={item.questionId} round={item.reviewRound} focusSignal={notesFocus} defaultOpen={false} /> : null}

      </article>

      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent title="카드 정보" description={`${meta.mask.subject && !metaControl.revealed ? '덱 (가려짐)' : item.deck.title} · ${meta.mask.source && !metaControl.revealed ? 'ID (가려짐)' : item.externalId}`}>
          <CardInfoTable card={item.card} round={item.reviewRound} />
          <div className="mt-4 flex flex-wrap gap-2">
            {!unrated ? <Button size="sm" onClick={() => { setShowInfo(false); cardMut.mutate({ action: 'suspend' }); }}><PauseCircle className="h-4 w-4" /> 이 문제 보류</Button> : null}
            <Link href={`/decks/${item.deck.id}?q=${encodeURIComponent(item.externalId)}`} className="inline-flex h-8 items-center rounded-md border border-line px-2.5 text-[13px]">덱에서 보기</Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionSummary({ params, done, queue, onRestart }: { params: StudyParams; done: Done[]; queue: Queue; onRestart: () => void }) {
  const gradable = done.filter((d) => d.isCorrect !== null);
  const correct = gradable.filter((d) => d.isCorrect).length;
  const counts = [1, 2, 3, 4].map((r) => done.filter((d) => d.rating === r).length);
  const nothing = queue.items.length === 0;
  const browse = params.mode === 'browse';
  return (
    <div className="mx-auto max-w-[840px]" data-testid="session-summary">
      <h1 className="text-xl font-semibold">{nothing ? (browse ? '볼 문제가 없습니다' : '지금은 학습할 카드가 없습니다') : browse ? '구경 완료' : '세션 완료'}</h1>
      {nothing && browse ? null : nothing ? (
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
        {params.mode === 'scheduled' && !nothing ? <Button variant="primary" onClick={onRestart}>더 학습하기</Button> : null}
        {browse && !nothing ? <Button variant="primary" onClick={onRestart}>처음부터 다시</Button> : null}
        {nothing && !browse ? <Link href={`/study/${params.scope}?mode=cram`} className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accent-ink">전체 훑기 (cram)</Link> : null}
        {nothing && !browse && params.scope !== 'all' ? <Link href={`/study/${params.scope}?mode=browse`} className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-sm" data-testid="browse-link">구경하기 (기록 없음)</Link> : null}
        <Link href={params.scope === 'all' ? '/' : `/decks/${params.scope}`} className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-sm">{params.scope === 'all' ? '대시보드로' : '덱으로 돌아가기'}</Link>
        <Link href="/insights" className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-sm">통계 보기</Link>
      </div>
    </div>
  );
}
