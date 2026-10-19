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
import { useSettings } from '@/components/layout/settings-context';

export interface StudyParams {
  scope: string; // deck id or 'all'
  mode: 'scheduled' | 'cram' | 'mistakes' | 'flagged' | 'practice';
  subject?: string;
  tags?: string[];
  types?: string[];
  difficultyMin?: number;
  difficultyMax?: number;
  limit?: number;
}

type CardState = 'answering' | 'submitted' | 'rated';

interface Done { questionId: string; rating?: number; isCorrect: boolean | null; reviewId?: string }

const MODE_LABEL: Record<StudyParams['mode'], string> = { scheduled: '예정된 학습', cram: '전체 훑기 (cram)', mistakes: '틀린 문제', flagged: '표시한 문제', practice: '연습 (스케줄 영향 없음)' };

function queueUrl(p: StudyParams) {
  const u = new URLSearchParams();
  if (p.scope !== 'all') u.set('deckId', p.scope);
  if (p.subject) u.set('subject', p.subject);
  u.set('mode', p.mode);
  if (p.tags?.length) u.set('tags', p.tags.join(','));
  if (p.types?.length) u.set('types', p.types.join(','));
  if (p.difficultyMin) u.set('difficultyMin', String(p.difficultyMin));
  if (p.difficultyMax) u.set('difficultyMax', String(p.difficultyMax));
  u.set('limit', String(p.limit ?? 200));
  return `/study/queue?${u.toString()}`;
}

export function StudyScreen({ params }: { params: StudyParams }) {
  const qc = useQueryClient();
  const { settings } = useSettings();
  const queue = useQuery({ queryKey: ['queue', params], queryFn: () => api<Queue>(queueUrl(params)), staleTime: Infinity, refetchOnMount: 'always' });
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
  const startedAt = useRef<number>(0);
  const digitHandler = useRef<((n: number) => void) | null>(null);
  const submitLock = useRef(false);
  const [shuffleSeed] = useState(() => uid());

  const items = useMemo(() => [...(queue.data?.items ?? []), ...extraItems].filter((i) => !skipped.has(i.questionId)), [queue.data, extraItems, skipped]);
  const item = items[index] ?? null;
  const finished = queue.isSuccess && (items.length === 0 || index >= items.length);
  const isPractice = params.mode === 'practice';

  // session bookkeeping
  useEffect(() => {
    if (!queue.data || sessionId) return;
    api<{ id: string }>('/study/sessions', { method: 'POST', json: { scope: params.scope, subject: params.subject, mode: params.mode, queueSize: queue.data.items.length } })
      .then((s) => setSessionId(s.id))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.data]);
  useEffect(() => {
    if (finished && sessionId) api(`/study/sessions/${sessionId}/end`, { method: 'PATCH' }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  useEffect(() => {
    if (startedAt.current === 0) startedAt.current = Date.now();
  }, []);

  const resetCard = useCallback(() => {
    setPhase('answering');
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
    onError: (e: Error) => {
      setPendingRating(null);
      if (e instanceof ApiRequestError && e.status === 409) toast.error('이 카드가 다른 곳에서 먼저 평가되었습니다', { description: '큐를 새로고침하세요.' });
      else toast.error('평가를 저장하지 못했습니다', { description: e.message });
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
      // keep the card's new version so the next rating does not conflict
      qc.setQueryData<Queue>(['queue', params], (old) => old ? { ...old, items: old.items.map((i) => (i.questionId === lastReview.questionId ? { ...i, card: { ...i.card, version: res.card.version } } : i)) } : old);
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
        qc.setQueryData<Queue>(['queue', params], (old) => old ? { ...old, items: old.items.map((i) => (i.questionId === item.questionId ? { ...i, card: { ...i.card, flagged } } : i)) } : old);
        setExtraItems((x) => x.map((i) => (i.questionId === item.questionId ? { ...i, card: { ...i.card, flagged } } : i)));
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

  const phaseForRenderer: Phase = phase === 'answering' ? 'answering' : revealedBeforeAnswer ? 'revealed' : 'submitted';
  const shortcutsOn = settings.shortcutsEnabled;
  const typing = item?.type === 'essay' || item?.type === 'short_answer' || item?.type === 'cloze';

  useShortcuts(
    'study',
    [
      { keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], description: phase === 'answering' ? '보기 선택 (1–9)' : '평가 Again / Hard / Good / Easy (1–4)', group: '학습', handler: (e) => {
        const n = Number(e.key);
        if (phase === 'answering') { digitHandler.current?.(n); return; }
        if (phase === 'submitted' && n >= 1 && n <= 4) { rate(n as 1 | 2 | 3 | 4); return; }
        return false;
      } },
      { keys: 'Enter', description: '답안 제출 / 다음', group: '학습', handler: () => {
        if (phase === 'answering') { if (typing) return false; submit(); return; }
        if (phase === 'submitted') return false; // Enter never rates by accident
        if (phase === 'rated') { next(); return; }
        return false;
      } },
      { keys: 'Enter', mod: 'ctrlOrMeta', allowInEditable: true, description: '제출 (입력창 안에서)', group: '학습', handler: () => (phase === 'answering' ? (submit(), undefined) : false) },
      { keys: ' ', description: phase === 'answering' ? '정답 공개 (답 없이)' : '해설 펼치기 / 접기', group: '학습', handler: () => {
        if (phase === 'answering') { reveal(); return; }
        setShowExplanation((v) => !v);
      } },
      { keys: 'e', description: '해설 토글', group: '학습', handler: () => (phase === 'answering' ? false : (setShowExplanation((v) => !v), undefined)) },
      { keys: 'n', description: '다음 문제 (평가 후)', group: '학습', handler: () => (phase === 'rated' ? (next(), undefined) : false) },
      { keys: 'u', description: '마지막 평가 되돌리기', group: '학습', handler: () => { undo(); } },
      { keys: 'h', description: '힌트 보기', group: '학습', handler: () => (item?.hasHint && phase === 'answering' ? (void showHint(), undefined) : false) },
      { keys: 'm', description: '메모 작성 (이번 회차)', group: '학습', handler: () => setNotesFocus((n) => n + 1) },
      { keys: 'f', description: '문제 표시 / 해제', group: '학습', handler: () => (item ? (cardMut.mutate({ action: item.card.flagged ? 'unflag' : 'flag' }), undefined) : false) },
      { keys: 'i', description: '카드 정보', group: '학습', handler: () => setShowInfo((v) => !v) },
      { keys: 's', description: '건너뛰기 (내일까지 묻기)', group: '학습', handler: () => (item && !isPractice ? (cardMut.mutate({ action: 'bury' }), undefined) : false) },
      { keys: 'Escape', description: '입력창 나가기 / 닫기', group: '학습', handler: () => (showInfo ? (setShowInfo(false), undefined) : false) },
    ],
    shortcutsOn && !finished && !!item,
  );

  if (queue.isLoading) return <div className="mx-auto max-w-[840px] space-y-4"><Skeleton className="h-6 w-40" /><Skeleton className="h-40" /><Skeleton className="h-12" /></div>;
  if (queue.isError) return <div className="mx-auto max-w-[840px]"><ErrorState message={(queue.error as Error).message} onRetry={() => queue.refetch()} /></div>;
  if (finished || !item) return <SessionSummary params={params} done={done} queue={queue.data!} onRestart={() => { setIndex(0); setDone([]); setExtraItems([]); setSkipped(new Set()); resetCard(); void queue.refetch(); }} />;

  const progress = done.length;
  const total = items.length;

  return (
    <div className="mx-auto w-full max-w-[840px]" data-testid="study-screen" data-phase={phase} data-type={item.type} data-round={item.reviewRound}>
      {/* progress strip */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
        <span className="font-medium text-ink">{queue.data?.deck?.title ?? (params.subject ? `과목: ${params.subject}` : '모든 덱')}</span>
        <Badge tone={isPractice ? 'warn' : 'neutral'}>{MODE_LABEL[params.mode]}</Badge>
        <span className="tabular">{progress} / {total} 완료</span>
        {params.mode === 'scheduled' ? <span className="tabular">오늘 복습 {queue.data?.counts.reviewedToday ?? 0} / 목표 {settings.dailyReviewGoal}</span> : null}
        {lastReview && phase === 'answering' ? <span className="flex items-center gap-1 tabular" data-testid="last-rating">직전 <span className={cn('font-medium', RATINGS[lastReview.rating - 1]!.cls.split(' ')[1])}>{RATINGS[lastReview.rating - 1]!.ko}</span>{lastReview.interval ? ` · ${lastReview.interval}` : ''} <kbd className="kbd" aria-hidden>U</kbd></span> : null}
        <span className="ml-auto flex items-center gap-1"><kbd className="kbd">?</kbd> 단축키</span>
      </div>
      <div className="mb-5 h-1 w-full overflow-hidden rounded-full bg-sunken" aria-hidden><div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${(progress / Math.max(1, total)) * 100}%` }} /></div>

      <article className="space-y-5" key={`${item.questionId}:${item.reviewRound}`}>
        <header className="flex items-start justify-between gap-3">
          <QuestionPrompt
            question={item.question}
            extra={<>
              <span>{item.reviewRound}회차</span>
              <span>{item.card.status === 'NEW' ? '새 카드' : item.card.status === 'REVIEW' ? '복습' : '학습 중'}</span>
              {item.noteCount ? <span>메모 {item.noteCount}</span> : null}
            </>}
          />
          <div className="flex shrink-0 items-center gap-1">
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
            {!isPractice ? <Button variant="ghost" onClick={() => cardMut.mutate({ action: 'bury' })} kbd="S" className="ml-auto"><SkipForward className="h-4 w-4" /> 내일로</Button> : null}
          </div>
        ) : null}

        {phase !== 'answering' && grade ? (
          <div className="space-y-4" data-testid="result">
            <div className="flex flex-wrap items-center gap-3">
              <Verdict grade={grade.grade} revealedBeforeAnswer={revealedBeforeAnswer} />
              <Button size="sm" variant="ghost" onClick={() => setShowExplanation((v) => !v)} kbd="E" className="ml-auto">{showExplanation ? '해설 접기' : '해설 보기'}</Button>
            </div>
            <ExplanationPanel explanation={grade.explanation} source={item.question.source} open={showExplanation} />
            {phase === 'submitted' ? (
              isPractice ? (
                <div className="flex items-center gap-2">
                  <Button variant="primary" size="lg" onClick={() => { setDone((d) => [...d, { questionId: item.questionId, isCorrect: grade.grade.isCorrect }]); next(); }} kbd="N" data-testid="next-btn">다음 <ArrowRight className="h-4 w-4" /></Button>
                  <span className="text-[12px] text-ink-3">연습 모드: FSRS 스케줄은 바뀌지 않습니다.</span>
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

        <NotesPanel questionId={item.questionId} round={item.reviewRound} focusSignal={notesFocus} defaultOpen={false} />

      </article>

      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent title="카드 정보" description={`${item.deck.title} · ${item.externalId}`}>
          <CardInfoTable card={item.card} round={item.reviewRound} />
          <div className="mt-4 flex flex-wrap gap-2">
            {!isPractice ? <Button size="sm" onClick={() => { setShowInfo(false); cardMut.mutate({ action: 'suspend' }); }}><PauseCircle className="h-4 w-4" /> 이 문제 보류</Button> : null}
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
  return (
    <div className="mx-auto max-w-[840px]" data-testid="session-summary">
      <h1 className="text-xl font-semibold">{nothing ? '지금은 학습할 카드가 없습니다' : '세션 완료'}</h1>
      {nothing ? (
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
          <div><div className="text-[12px] text-ink-3">평가 분포</div><div className="text-sm tabular">다시 {counts[0]} · 어려움 {counts[1]} · 보통 {counts[2]} · 쉬움 {counts[3]}</div></div>
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        {params.mode === 'scheduled' && !nothing ? <Button variant="primary" onClick={onRestart}>더 학습하기</Button> : null}
        {nothing ? <Link href={`/study/${params.scope}?mode=cram`} className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accent-ink">전체 훑기 (cram)</Link> : null}
        <Link href={params.scope === 'all' ? '/' : `/decks/${params.scope}`} className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-sm">{params.scope === 'all' ? '대시보드로' : '덱으로 돌아가기'}</Link>
        <Link href="/insights" className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-sm">통계 보기</Link>
      </div>
    </div>
  );
}
