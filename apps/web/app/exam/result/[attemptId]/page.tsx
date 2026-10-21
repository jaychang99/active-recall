'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import Link from '@/components/ui/navigation-link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { toast } from 'sonner';
import type { PublicQuestion } from '@recall/contracts';
import { api, type Exam } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, PageHeader, Panel, Stat, LoadingState } from '@/components/ui/misc';
import { QuestionPrompt, QuestionRenderer } from '@/components/questions/question-renderer';
import { ExplanationPanel, Verdict } from '@/components/study/explanation-panel';
import { TYPE_LABEL, cn, pct } from '@/lib/utils';

export default function ExamResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();
  const exam = useQuery({ queryKey: ['exam-result', attemptId], queryFn: () => api<Exam>(`/exams/${attemptId}`) });
  const [filter, setFilter] = useState<'all' | 'wrong'>('all');
  const retry = useMutation({
    mutationFn: () => api<Exam>('/exams', { method: 'POST', json: { deckId: exam.data!.deck.id, retryOfAttemptId: attemptId, title: `${exam.data!.title} — 오답 재시험` } }),
    onSuccess: (e) => router.push(`/exam/run/${e.id}`),
    onError: (e: Error) => toast.error(e.message),
  });
  if (exam.isLoading) return <LoadingState label="시험 결과를 불러오는 중…" className="min-h-64" />;
  if (exam.isError) return <ErrorState message={(exam.error as Error).message} onRetry={() => exam.refetch()} />;
  const e = exam.data!;
  const s = e.score;
  if (!s) return <ErrorState title="아직 제출되지 않은 시험입니다" onRetry={() => router.push(`/exam/run/${attemptId}`)} />;
  const list = e.questions.filter((q) => filter === 'all' || q.response?.isCorrect === false || (q.response?.isCorrect === null && q.type !== 'essay'));
  const wrongCount = e.questions.filter((q) => q.type !== 'essay' && q.response?.isCorrect !== true).length;
  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader title={e.title} description={`${e.deck.title} · ${s.durationSec !== null ? `${Math.floor(s.durationSec / 60)}분 ${s.durationSec % 60}초` : ''}`} actions={<>{wrongCount ? <Button loading={retry.isPending} variant="primary" onClick={() => retry.mutate()}><RotateCcw className="h-4 w-4" /> 오답 {wrongCount}문항 재시험</Button> : null}<Link href={`/exam?deckId=${e.deck.id}`}><Button>새 시험</Button></Link></>} />
      <Panel className="mb-6 grid grid-cols-2 gap-6 p-5 sm:grid-cols-4" data-testid="exam-score">
        <Stat label="객관 정답률" value={pct(s.objectiveAccuracy)} hint={`${s.objectiveCorrect} / ${s.objectiveTotal} (서술형 제외)`} />
        <Stat label="서술형 자기평가" value={s.essayTotal ? `${s.essaySelfScore} / ${s.essayMaxScore}` : '—'} hint={`${s.essayTotal}문항 · 자동 채점 아님`} />
        <Stat label="답변" value={`${s.answered} / ${e.questions.length}`} />
        <div>
          <div className="text-[12px] text-ink-3">유형별</div>
          <ul className="mt-1 space-y-0.5 text-[12px] tabular">{Object.entries(s.byType).map(([t, v]) => <li key={t}>{TYPE_LABEL[t]} {t === 'essay' ? `${v.total} (수동)` : `${v.correct}/${v.total}`}</li>)}</ul>
        </div>
      </Panel>
      <div className="mb-4 flex gap-1.5">
        <button type="button" onClick={() => setFilter('all')} className={cn('rounded-full border px-3 py-1 text-[13px]', filter === 'all' ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-line')}>전체 {e.questions.length}</button>
        <button type="button" onClick={() => setFilter('wrong')} className={cn('rounded-full border px-3 py-1 text-[13px]', filter === 'wrong' ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-line')}>오답·미답 {wrongCount}</button>
      </div>
      <ol className="space-y-6">
        {list.map((q) => (
          <li key={q.questionId} className="rounded-lg border border-line bg-elevated p-4">
            <div className="mb-2 flex items-center gap-2 text-[12px] text-ink-3"><span className="font-semibold text-ink-2">{q.index + 1}.</span><span>{q.externalId}</span>{q.response?.isCorrect === true ? <Badge tone="ok">정답</Badge> : q.type === 'essay' ? <Badge>자기평가 {q.response?.selfScore ?? 0}점</Badge> : q.response?.answerPayload ? <Badge tone="bad">오답</Badge> : <Badge tone="warn">미답</Badge>}</div>
            <QuestionPrompt question={q.question as PublicQuestion} />
            <div className="mt-3">
              <QuestionRenderer question={q.question as PublicQuestion} value={q.response?.answerPayload ?? null} onChange={() => {}} onSubmit={() => {}} phase="submitted" grade={q.response ? { isCorrect: q.response.isCorrect, gradable: q.type !== 'essay', detail: q.response.detail } : null} answerKey={q.answerKey ?? null} shuffleSeed={null} showKeyHints={false} readOnly compact />
            </div>
            <div className="mt-3 space-y-3">
              <Verdict grade={q.response ? { isCorrect: q.response.isCorrect, gradable: q.type !== 'essay', detail: q.response.detail } : null} revealedBeforeAnswer={false} />
              {q.explanation ? <ExplanationPanel explanation={q.explanation} open /> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
