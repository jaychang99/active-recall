'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Send, Timer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AnswerPayload, PublicQuestion } from '@recall/contracts';
import { api, type Exam } from '@/lib/api';
import { useShortcuts } from '@/lib/shortcuts/provider';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/misc';
import { QuestionPrompt, QuestionRenderer } from '@/components/questions/question-renderer';
import { cn, uid } from '@/lib/utils';
import { useSettings } from '@/components/layout/settings-context';
import { StudyActions } from '@/components/study/study-actions';
import { dismissAnswerKeyboard } from '@/lib/answer-focus';

export default function ExamRunPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();
  const { settings } = useSettings();
  const exam = useQuery({ queryKey: ['exam', attemptId], queryFn: () => api<Exam>(`/exams/${attemptId}`), staleTime: Infinity });
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerPayload | null>>({});
  const [now, setNow] = useState(() => Date.now());
  const digit = useRef<((n: number) => void) | null>(null);
  const [seed] = useState(() => uid());
  useEffect(() => {
    if (exam.data?.submittedAt) router.replace(`/exam/result/${attemptId}`);
  }, [exam.data, attemptId, router]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const limit = (exam.data?.config as { timeLimitSec?: number | null })?.timeLimitSec ?? null;
  const elapsed = exam.data ? Math.floor((now - new Date(exam.data.startedAt).getTime()) / 1000) : 0;
  const remaining = limit ? limit - elapsed : null;

  const submit = useMutation({
    mutationFn: () => api<Exam>(`/exams/${attemptId}/submit`, { method: 'POST', json: { responses: (exam.data?.questions ?? []).map((q) => ({ questionId: q.questionId, answerPayload: answers[q.questionId] ?? null, selfScores: answers[q.questionId]?.type === 'essay' ? (answers[q.questionId] as { selfScores?: number[] }).selfScores : undefined })) } }),
    onSuccess: () => router.push(`/exam/result/${attemptId}`),
    onError: (e: Error) => toast.error('제출 실패', { description: e.message }),
  });
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (remaining !== null && remaining <= 0 && !autoSubmitted.current && exam.data && !exam.data.submittedAt) {
      autoSubmitted.current = true;
      toast('제한 시간이 끝나 자동 제출합니다');
      submit.mutate();
    }
  }, [remaining, exam.data, submit]);

  const questions = exam.data?.questions ?? [];
  const current = questions[index];
  const answered = questions.filter((q) => answers[q.questionId]).length;
  const go = useCallback((i: number) => { dismissAnswerKeyboard(); setIndex(Math.max(0, Math.min(questions.length - 1, i))); }, [questions.length]);
  const registerDigitHandler = useCallback((fn: ((n: number) => void) | null) => { digit.current = fn; }, []);
  const typing = current?.type === 'essay' || current?.type === 'short_answer' || current?.type === 'cloze' || current?.type === 'numeric' || current?.type === 'stepwise' || current?.type === 'recall_card';

  useShortcuts('study', [
    { keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], description: '보기 선택', group: '시험', handler: (e) => { digit.current?.(Number(e.key)); } },
    { keys: 'ArrowRight', description: '다음 문항', group: '시험', handler: () => go(index + 1) },
    { keys: 'ArrowLeft', description: '이전 문항', group: '시험', handler: () => go(index - 1) },
    { keys: 'Enter', description: '다음 문항', group: '시험', handler: () => (typing ? false : (go(index + 1), undefined)) },
    { keys: 'Enter', mod: 'ctrlOrMeta', allowInEditable: true, description: '다음 문항 (입력창)', group: '시험', handler: () => go(index + 1) },
  ], settings.shortcutsEnabled && !!current);

  if (exam.isLoading) return <div className="mx-auto max-w-[840px]"><LoadingState label="시험 문항을 불러오는 중…" className="min-h-64" /></div>;
  if (exam.isError) return <ErrorState message={(exam.error as Error).message} onRetry={() => exam.refetch()} />;
  if (!current) return null;

  return (
    <div className="mx-auto w-full max-w-[840px]" data-study-root data-testid="exam-run">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px] text-ink-3">
        <span className="font-medium text-ink">{exam.data!.title}</span>
        <span className="tabular">{index + 1} / {questions.length}</span>
        <span className="tabular">답변 {answered}</span>
        {remaining !== null ? <span className={cn('ml-auto flex items-center gap-1 tabular', remaining < 60 && 'text-bad-ink font-semibold')}><Timer className="h-3.5 w-3.5" /> {Math.max(0, Math.floor(remaining / 60))}:{String(Math.max(0, remaining % 60)).padStart(2, '0')}</span> : <span className="ml-auto tabular">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>}
      </div>
      <div className="mb-4 flex flex-wrap gap-1" aria-label="문항 이동">
        {questions.map((q, i) => (
          <button key={q.questionId} type="button" onClick={() => setIndex(i)} aria-current={i === index} className={cn('h-7 min-w-7 rounded border px-1 text-[12px] tabular', i === index ? 'border-accent bg-accent text-accent-ink' : answers[q.questionId] ? 'border-accent/50 bg-accent-soft/60 text-accent-soft-ink' : 'border-line text-ink-3')}>{i + 1}</button>
        ))}
      </div>
      <article key={current.questionId} className="space-y-5">
        <QuestionPrompt question={current.question as PublicQuestion} />
        <QuestionRenderer question={current.question as PublicQuestion} value={answers[current.questionId] ?? null} onChange={(v) => setAnswers((a) => ({ ...a, [current.questionId]: v }))} onSubmit={() => go(index + 1)} phase="answering" grade={null} answerKey={null} shuffleSeed={settings.shuffleChoices ? seed : null} showKeyHints={settings.shortcutsEnabled} registerDigitHandler={registerDigitHandler} />
        <StudyActions><div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => go(index - 1)} disabled={index === 0} kbd="←"><ChevronLeft className="h-4 w-4" /> 이전</Button>
          <Button onClick={() => go(index + 1)} disabled={index === questions.length - 1} kbd="→">다음 <ChevronRight className="h-4 w-4" /></Button>
          <Button variant="primary" className="ml-auto" onClick={() => { if (answered < questions.length && !confirm(`${questions.length - answered}문항이 미답입니다. 제출할까요?`)) return; submit.mutate(); }} loading={submit.isPending} loadingLabel="시험 채점 중…" disabled={submit.isPending} data-testid="submit-exam"><Send className="h-4 w-4" /> 제출 ({answered}/{questions.length})</Button>
        </div></StudyActions>
      </article>
    </div>
  );
}
