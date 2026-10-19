'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api, type Deck, type Overview, type SubjectSummary } from '@/lib/api';
import { Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ErrorState, PageHeader, Panel, Skeleton, Stat } from '@/components/ui/misc';
import { ActivityHeatmap } from '@/components/insights/heatmap';
import { BarChart, HBar } from '@/components/insights/charts';
import { TYPE_LABEL, pct } from '@/lib/utils';

export default function InsightsPage() {
  const sp = useSearchParams();
  const [deckId, setDeckId] = useState(sp.get('deckId') ?? '');
  const [subject, setSubject] = useState(sp.get('subject') ?? '');
  const [days, setDays] = useState(30);
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api<Deck[]>('/decks') });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => api<SubjectSummary[]>('/subjects') });
  const qs = new URLSearchParams({ days: String(days) });
  if (deckId) qs.set('deckId', deckId);
  if (subject) qs.set('subject', subject);
  const ov = useQuery({ queryKey: ['overview', qs.toString()], queryFn: () => api<Overview>(`/analytics/overview?${qs.toString()}`) });
  const o = ov.data;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="통계" description="모든 비율의 분모를 함께 표시합니다. '예상 기억률'은 FSRS가 추정한 값이며 실제 정답률과 다릅니다." actions={
        <>
          <Select value={deckId} onChange={(e) => setDeckId(e.target.value)} aria-label="덱 필터"><option value="">모든 덱</option>{decks.data?.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</Select>
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="과목 필터"><option value="">모든 과목</option>{subjects.data?.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</Select>
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="기간"><option value={7}>7일</option><option value={30}>30일</option><option value={90}>90일</option><option value={365}>1년</option></Select>
        </>
      } />
      {ov.isLoading ? <Skeleton className="h-64" /> : null}
      {ov.isError ? <ErrorState message={(ov.error as Error).message} onRetry={() => ov.refetch()} /> : null}
      {o ? (
        <div className="space-y-6" data-testid="insights">
          <Panel className="grid grid-cols-2 gap-6 p-5 md:grid-cols-4 lg:grid-cols-6">
            <Stat label="오늘 복습" value={o.today.reviewed} hint={`카드 ${o.today.uniqueCards} · 새 ${o.today.newIntroduced} · 목표 ${o.today.goal}`} />
            <Stat label="오늘 due / 지남" value={`${o.today.due} / ${o.today.overdue}`} />
            <Stat label={`${days}일 복습`} value={o.window.reviews} hint={`7일 ${o.window.last7} · 30일 ${o.window.last30}`} />
            <Stat label={`${days}일 정답률`} value={pct(o.window.accuracy)} hint={`자동채점 ${o.window.gradable}문항 분모`} />
            <Stat label="연속 학습" value={`${o.streak.current}일`} hint={`최장 ${o.streak.longest} · 활동일 ${o.streak.activeDays}`} />
            <Stat label="예상 기억률" value={pct(o.estimatedRetention.value)} hint={`FSRS 추정 · ${o.estimatedRetention.cards}카드`} />
          </Panel>

          <section className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Panel className="p-5">
              <h2 className="mb-1 text-[13px] font-semibold text-ink-2">일별 복습 수 (초록 = 자동채점 정답)</h2>
              <BarChart ariaLabel="일별 복습 수" data={o.series.map((s) => ({ label: s.day, value: s.reviews, secondary: s.correct }))} secondary labelEvery={days <= 7 ? 1 : days <= 30 ? 5 : 30} />
            </Panel>
            <Panel className="p-5">
              <h2 className="mb-1 text-[13px] font-semibold text-ink-2">앞으로 30일 복습 예정 (due)</h2>
              <BarChart ariaLabel="복습 예정" data={o.forecast.map((f) => ({ label: f.day, value: f.due }))} labelEvery={5} />
            </Panel>
            <Panel className="p-5">
              <h2 className="mb-3 text-[13px] font-semibold text-ink-2">유형별 정답률 (자동채점 문항만)</h2>
              {o.byType.length ? <HBar rows={o.byType.map((t) => ({ label: TYPE_LABEL[t.type] ?? t.type, value: t.accuracy ?? 0, hint: t.type === 'essay' ? `${t.total}회 · 수동` : `${t.correct}/${t.gradable}`, tone: (t.accuracy ?? 1) < 0.6 ? 'bad' : 'accent' }))} format={(v) => pct(v)} /> : <p className="text-sm text-ink-3">아직 복습 기록이 없습니다.</p>}
            </Panel>
            <Panel className="p-5">
              <h2 className="mb-3 text-[13px] font-semibold text-ink-2">평가 분포 ({days}일)</h2>
              <HBar rows={[{ label: '다시 (Again)', value: o.gradeDistribution.again, tone: 'bad' }, { label: '어려움 (Hard)', value: o.gradeDistribution.hard, tone: 'warn' }, { label: '보통 (Good)', value: o.gradeDistribution.good }, { label: '쉬움 (Easy)', value: o.gradeDistribution.easy, tone: 'ok' }]} />
              <dl className="mt-4 grid grid-cols-2 gap-y-1 text-[13px]">
                <dt className="text-ink-3">문항당 평균</dt><dd className="tabular">{o.window.avgSeconds ?? '—'}초 · 총 {o.window.totalMinutes}분</dd>
                <dt className="text-ink-3">답 없이 공개한 비율</dt><dd className="tabular">{pct(o.window.revealedBeforeAnswerRate)}</dd>
                <dt className="text-ink-3">힌트 사용률</dt><dd className="tabular">{pct(o.window.hintRate)}</dd>
                <dt className="text-ink-3">연습 모드</dt><dd className="tabular">{o.window.practiceAnswers}회 · 정답률 {pct(o.window.practiceAccuracy)}</dd>
              </dl>
            </Panel>
            <Panel className="p-5">
              <h2 className="mb-3 text-[13px] font-semibold text-ink-2">카드 상태</h2>
              <HBar rows={[{ label: '새 카드', value: o.states.new }, { label: '학습 중', value: o.states.learning, tone: 'warn' }, { label: '재학습', value: o.states.relearning, tone: 'warn' }, { label: '복습', value: o.states.review, tone: 'ok' }, { label: '보류', value: o.states.suspended }, { label: '표시', value: o.states.flagged }]} />
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div><h3 className="mb-1 text-[12px] text-ink-3">FSRS 난이도 분포</h3><HBar rows={o.difficultyBuckets.map((b) => ({ label: b.label, value: b.count }))} /></div>
                <div><h3 className="mb-1 text-[12px] text-ink-3">안정성(간격) 분포</h3><HBar rows={o.stabilityBuckets.map((b) => ({ label: b.label, value: b.count }))} /></div>
              </div>
            </Panel>
            <Panel className="min-w-0 overflow-hidden p-5">
              <h2 className="mb-3 text-[13px] font-semibold text-ink-2">최근 1년 활동</h2>
              <ActivityHeatmap days={364} deckId={deckId || undefined} subject={subject || undefined} />
            </Panel>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <Panel className="p-5">
              <h2 className="mb-3 text-[13px] font-semibold text-ink-2">가장 자주 틀린 문항 ({days}일, Again 횟수)</h2>
              {o.hardest.length ? <ul className="space-y-1.5 text-[13px]">{o.hardest.map((h) => <li key={h.questionId} className="flex gap-2"><Badge tone="bad">{h.again}</Badge><span className="line-clamp-1">{h.prompt}</span><span className="ml-auto shrink-0 text-ink-3">{TYPE_LABEL[h.type]}</span></li>)}</ul> : <p className="text-sm text-ink-3">없음</p>}
            </Panel>
            <Panel className="p-5">
              <h2 className="mb-3 text-[13px] font-semibold text-ink-2">리치(leech) — 실패가 많은 카드</h2>
              {o.leeches.length ? <ul className="space-y-1.5 text-[13px]">{o.leeches.map((h) => <li key={h.questionId} className="flex gap-2"><Badge tone="warn">실패 {h.lapses}</Badge><span className="line-clamp-1">{h.prompt}</span></li>)}</ul> : <p className="text-sm text-ink-3">리치 카드가 없습니다. (설정의 리치 기준 이상 실패한 카드)</p>}
              <Link href="/study/all?mode=mistakes" className="mt-3 inline-block text-sm text-accent">틀린 문제 다시 보기 →</Link>
            </Panel>
          </section>

          <Panel className="overflow-x-auto p-5">
            <h2 className="mb-3 text-[13px] font-semibold text-ink-2">덱별 진행</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-[12px] text-ink-3"><tr><th className="py-1 pr-3">덱</th><th className="py-1 pr-3">과목</th><th className="py-1 pr-3 text-right">문항</th><th className="py-1 pr-3 text-right">새/학습/복습</th><th className="py-1 pr-3 text-right">오늘 due</th><th className="py-1 pr-3 text-right">{days}일 복습</th><th className="py-1 text-right">정답률</th></tr></thead>
              <tbody>{o.decks.map((d) => <tr key={d.id} className="border-t border-line"><td className="py-1.5 pr-3"><Link href={`/decks/${d.id}`} className="hover:underline">{d.title}</Link></td><td className="py-1.5 pr-3 text-ink-3">{d.subject}</td><td className="py-1.5 pr-3 text-right tabular">{d.total}</td><td className="py-1.5 pr-3 text-right tabular">{d.new}/{d.learning + d.relearning}/{d.review}</td><td className="py-1.5 pr-3 text-right tabular">{d.dueToday}</td><td className="py-1.5 pr-3 text-right tabular">{d.reviewsInWindow}</td><td className="py-1.5 text-right tabular">{pct(d.accuracy)} <span className="text-[11px] text-ink-3">({d.gradable})</span></td></tr>)}</tbody>
            </table>
          </Panel>

          {o.exams.length ? (
            <Panel className="p-5">
              <h2 className="mb-3 text-[13px] font-semibold text-ink-2">최근 시험</h2>
              <ul className="space-y-1 text-sm">{o.exams.map((e) => <li key={e.id} className="flex items-center gap-3"><Link href={`/exam/result/${e.id}`} className="hover:underline">{e.title}</Link><span className="text-ink-3">{e.deck.title}</span><span className="ml-auto tabular">{pct(e.score?.objectiveAccuracy)} <span className="text-[11px] text-ink-3">({e.score?.objectiveCorrect}/{e.score?.objectiveTotal})</span></span></li>)}</ul>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
