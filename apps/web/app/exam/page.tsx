'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { GraduationCap, Play } from 'lucide-react';
import Link from '@/components/ui/navigation-link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, type Deck, type DeckDetail, type Exam, type ExamSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, PageHeader, Panel, LoadingState } from '@/components/ui/misc';
import { TYPE_LABEL, formatDateTime, pct } from '@/lib/utils';

export default function ExamSetupPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api<Deck[]>('/decks') });
  const [deckId, setDeckId] = useState(sp.get('deckId') ?? '');
  const effectiveDeck = deckId || decks.data?.[0]?.id || '';
  const deck = useQuery({ queryKey: ['deck', effectiveDeck], queryFn: () => api<DeckDetail>(`/decks/${effectiveDeck}`), enabled: !!effectiveDeck });
  const history = useQuery({ queryKey: ['exams', effectiveDeck], queryFn: () => api<ExamSummary[]>(`/exams?deckId=${effectiveDeck}`), enabled: !!effectiveDeck });
  const [count, setCount] = useState(20);
  const [shuffle, setShuffle] = useState(true);
  const [types, setTypes] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [dMin, setDMin] = useState(1);
  const [dMax, setDMax] = useState(5);
  const [timeLimit, setTimeLimit] = useState(0);
  const [title, setTitle] = useState('');
  const create = useMutation({
    mutationFn: () => api<Exam>('/exams', { method: 'POST', json: { deckId: effectiveDeck, title: title || undefined, count, shuffle, types: types.length ? types : undefined, tags: tags.length ? tags : undefined, difficultyMin: dMin, difficultyMax: dMax, timeLimitSec: timeLimit ? timeLimit * 60 : undefined } }),
    onSuccess: (e) => router.push(`/exam/run/${e.id}`),
    onError: (e: Error) => toast.error('시험을 만들지 못했습니다', { description: e.message }),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="시험" description="시험 모드는 FSRS 스케줄에 영향을 주지 않습니다. 제출 후 점수와 오답 분석을 보여주며, 서술형은 객관 점수 분모에서 제외됩니다." />
      {decks.isLoading ? <LoadingState label="시험 정보를 불러오는 중…" className="min-h-40" /> : null}
      {decks.isError ? <ErrorState message={(decks.error as Error).message} onRetry={() => decks.refetch()} /> : null}
      {decks.isSuccess && decks.data.length === 0 ? <EmptyState title="시험을 볼 덱이 없습니다" action={<Link href="/import"><Button variant="primary">가져오기</Button></Link>} /> : null}
      {decks.data?.length ? (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Panel className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="deck">덱</Label><Select id="deck" className="mt-1 w-full" value={effectiveDeck} onChange={(e) => setDeckId(e.target.value)}>{decks.data.map((d) => <option key={d.id} value={d.id}>{d.title} ({d.progress.total})</option>)}</Select></div>
              <div><Label htmlFor="title">시험 이름</Label><Input id="title" className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={deck.data ? `${deck.data.title} 시험` : ''} /></div>
              <div><Label htmlFor="count">문항 수</Label><Input id="count" type="number" min={1} max={1000} className="mt-1" value={count} onChange={(e) => setCount(Number(e.target.value))} /></div>
              <div><Label htmlFor="time">제한 시간 (분, 0=없음)</Label><Input id="time" type="number" min={0} max={360} className="mt-1" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} /></div>
              <div><Label>난이도 범위</Label><div className="mt-1 flex items-center gap-2"><Select value={dMin} onChange={(e) => setDMin(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</Select><span>~</span><Select value={dMax} onChange={(e) => setDMax(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</Select></div></div>
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} /> 문항 순서 섞기</label>
            </div>
            <div>
              <Label>문항 유형 (선택 없음 = 전체)</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">{Object.entries(TYPE_LABEL).map(([k, v]) => <button key={k} type="button" aria-pressed={types.includes(k)} onClick={() => setTypes((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]))} className={`rounded-full border px-3 py-1 text-[13px] ${types.includes(k) ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-line text-ink-2'}`}>{v}</button>)}</div>
            </div>
            {deck.data?.questionTags.length ? (
              <div>
                <Label>태그 (선택 없음 = 전체)</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">{deck.data.questionTags.map((t) => <button key={t.tag} type="button" aria-pressed={tags.includes(t.tag)} onClick={() => setTags((x) => (x.includes(t.tag) ? x.filter((y) => y !== t.tag) : [...x, t.tag]))} className={`rounded-full border px-3 py-1 text-[13px] ${tags.includes(t.tag) ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-line text-ink-2'}`}>{t.tag} <span className="text-ink-3">{t.count}</span></button>)}</div>
              </div>
            ) : null}
            <Button loading={create.isPending} variant="primary" size="lg" onClick={() => create.mutate()} disabled={!effectiveDeck || create.isPending} data-testid="start-exam"><Play className="h-4 w-4" /> 시험 시작</Button>
          </Panel>
          <Panel className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink-2"><GraduationCap className="h-4 w-4" /> 시험 기록</h2>
            {history.data?.length === 0 ? <p className="text-sm text-ink-3">아직 시험 기록이 없습니다.</p> : null}
            <ul className="space-y-2">
              {history.data?.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm">
                  <div className="min-w-0"><div className="truncate font-medium">{h.title}</div><div className="text-[12px] text-ink-3">{formatDateTime(h.startedAt)} · {String((h.config as { count?: number }).count ?? '')}문항</div></div>
                  {h.submittedAt ? <Link href={`/exam/result/${h.id}`}><Badge tone="accent">{pct(h.score?.objectiveAccuracy)}</Badge></Link> : <Link href={`/exam/run/${h.id}`}><Badge tone="warn">진행 중</Badge></Link>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
