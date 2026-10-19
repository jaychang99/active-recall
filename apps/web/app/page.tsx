'use client';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, Flag, Flame, Play, Upload } from 'lucide-react';
import Link from 'next/link';
import { api, type Deck, type Overview, type SubjectSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, Panel, ProgressStrip, Skeleton, Stat } from '@/components/ui/misc';
import { pct } from '@/lib/utils';
import { CopyPromptButton } from '@/components/layout/copy-prompt-button';
import { ActivityHeatmap } from '@/components/insights/heatmap';

export default function DashboardPage() {
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api<Deck[]>('/decks') });
  const overview = useQuery({ queryKey: ['overview', {}], queryFn: () => api<Overview>('/analytics/overview?days=30') });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => api<SubjectSummary[]>('/subjects') });
  const o = overview.data;
  const dueTotal = decks.data?.reduce((a, d) => a + d.progress.dueToday, 0) ?? 0;
  const newTotal = decks.data?.reduce((a, d) => a + d.progress.new, 0) ?? 0;

  if (decks.isError) return <ErrorState message={(decks.error as Error).message} onRetry={() => decks.refetch()} />;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">오늘의 학습</h1>
          <p className="mt-1 text-sm text-ink-3">{o ? `${o.timezone} 기준 · 복습 ${o.today.reviewed} / 목표 ${o.today.goal}` : '불러오는 중…'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/study/all"><Button variant="primary" size="lg" disabled={!decks.data?.length}><Play className="h-4 w-4" /> 모든 덱 학습 {dueTotal + Math.min(newTotal, 20) > 0 ? <Badge tone="accent" className="ml-1 bg-white/20 text-accent-ink">{dueTotal} due</Badge> : null}</Button></Link>
          <Link href="/study/all?mode=mistakes"><Button size="lg"><AlertCircle className="h-4 w-4" /> 틀린 문제</Button></Link>
          <Link href="/study/all?mode=flagged"><Button size="lg"><Flag className="h-4 w-4" /> 표시한 문제</Button></Link>
        </div>
      </section>

      {decks.isSuccess && decks.data.length === 0 ? (
        <EmptyState
          icon={<Upload className="h-6 w-6" />}
          title="아직 덱이 없습니다"
          body="LLM에게 프롬프트와 스키마를 주고 문제 JSON을 생성한 뒤, 가져오기 화면에 붙여넣으면 바로 학습할 수 있습니다. 8종 문항 예제 덱도 가져올 수 있습니다."
          action={<div className="flex gap-2"><CopyPromptButton /><Link href="/import"><Button variant="primary">가져오기로 이동</Button></Link></div>}
        />
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Panel className="min-w-0 overflow-hidden p-5">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Stat label="오늘 due" value={o ? o.today.due : <Skeleton className="h-7 w-10" />} hint={o?.today.overdue ? `${o.today.overdue}개 기한 지남` : '학습·복습 합계'} />
            <Stat label="오늘 복습" value={o ? o.today.reviewed : <Skeleton className="h-7 w-10" />} hint={o ? `새 카드 ${o.today.newIntroduced} · ${o.today.minutes}분` : undefined} />
            <Stat label="오늘 정답률" value={o ? pct(o.today.accuracy) : <Skeleton className="h-7 w-10" />} hint={o ? `자동채점 ${o.today.gradable}문항 기준` : undefined} />
            <Stat label="연속 학습" value={o ? <span className="flex items-center gap-1">{o.streak.current}<span className="text-base font-normal text-ink-3">일</span>{o.streak.current >= 3 ? <Flame className="h-5 w-5 text-warn" /> : null}</span> : <Skeleton className="h-7 w-10" />} hint={o ? `최장 ${o.streak.longest}일` : undefined} />
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 flex items-center justify-between text-[12px] text-ink-3"><span>최근 1년 복습 활동</span><Link href="/insights" className="text-accent">통계 전체 보기 <ArrowRight className="inline h-3 w-3" /></Link></div>
            <ActivityHeatmap days={364} compact />
          </div>
        </Panel>
        <Panel className="min-w-0 p-5">
          <h2 className="text-[13px] font-semibold text-ink-2">30일 요약</h2>
          {o ? (
            <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-ink-3">복습 수</dt><dd className="tabular">{o.window.reviews}</dd>
              <dt className="text-ink-3">정답률</dt><dd className="tabular">{pct(o.window.accuracy)} <span className="text-[11px] text-ink-3">({o.window.gradable}문항)</span></dd>
              <dt className="text-ink-3">예상 기억률</dt><dd className="tabular">{pct(o.estimatedRetention.value)} <span className="text-[11px] text-ink-3">FSRS 추정</span></dd>
              <dt className="text-ink-3">문항당 평균</dt><dd className="tabular">{o.window.avgSeconds ?? '—'}초</dd>
              <dt className="text-ink-3">카드 상태</dt><dd className="tabular text-[12px]">새 {o.states.new} · 학습 {o.states.learning + o.states.relearning} · 복습 {o.states.review}</dd>
              <dt className="text-ink-3">리치(leech)</dt><dd className="tabular">{o.leeches.length}</dd>
            </dl>
          ) : <Skeleton className="mt-3 h-32" />}
        </Panel>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">덱</h2>
          <Link href="/decks" className="text-sm text-accent">전체 보기</Link>
        </div>
        {decks.isLoading ? <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {decks.data?.map((d) => (
            <Panel key={d.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/decks/${d.id}`} className="block truncate font-medium hover:underline">{d.title}</Link>
                  <div className="text-[12px] text-ink-3">{d.subject} · {d.progress.total}문항</div>
                </div>
                {d.progress.dueToday > 0 ? <Badge tone="accent">due {d.progress.dueToday}</Badge> : d.progress.new > 0 ? <Badge>새 {d.progress.new}</Badge> : <Badge tone="ok">완료</Badge>}
              </div>
              <ProgressStrip p={d.progress} />
              <div className="mt-auto flex gap-2">
                <Link href={`/study/${d.id}`} className="flex-1"><Button variant="primary" size="sm" className="w-full"><Play className="h-3.5 w-3.5" /> 학습</Button></Link>
                <Link href={`/exam?deckId=${d.id}`}><Button size="sm">시험</Button></Link>
              </div>
            </Panel>
          ))}
        </div>
      </section>

      {subjects.data?.length ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">과목</h2>
            <Link href="/subjects" className="text-sm text-accent">과목 관리</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {subjects.data.map((s) => (
              <Link key={s.id} href={`/study/all?subject=${encodeURIComponent(s.name)}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-elevated px-3 py-1.5 text-sm hover:border-line-strong">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color ?? 'var(--accent)' }} />
                {s.name}
                <span className="text-[12px] text-ink-3 tabular">{s.questionCount}문항 · due {s.progress.dueToday}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
