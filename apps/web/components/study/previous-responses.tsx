'use client';
import { useQuery } from '@tanstack/react-query';
import { Component, type ReactNode } from 'react';
import type { AnswerPayload, GradeResult, PublicQuestion } from '@recall/contracts';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/loading';
import { QuestionRenderer } from '@/components/questions/question-renderer';
import { RATINGS } from './rating-bar';

/** GET /reviews/responses/:questionId — effective reviews and practice attempts, newest first. */
export interface PastResponse {
  id: string;
  kind: 'review' | 'practice';
  at: string;
  reviewRound: number | null;
  rating: number | null;
  isCorrect: boolean | null;
  revealedBeforeAnswer: boolean;
  hintUsed: boolean;
  answerPayload: AnswerPayload | null;
  grade: GradeResult | null;
}

/**
 * Earlier answers to this question: reviews of earlier rounds, and practice attempts from before this session.
 * Fetched once the answer is open so the toggle can show a count.
 */
export function usePreviousResponses(questionId: string, round: number, sessionStartedAt: number, enabled: boolean) {
  const query = useQuery({
    // per round: a re-queued copy (round + 1) must see the review just made in this session
    queryKey: ['responses', questionId, round],
    queryFn: () => api<{ items: PastResponse[] }>(`/reviews/responses/${questionId}`),
    enabled,
  });
  const items = (query.data?.items ?? []).filter((r) => (r.kind === 'review' ? (r.reviewRound ?? 0) < round : Date.parse(r.at) < sessionStartedAt));
  return { query, items };
}

class RenderGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p className="text-[13px] text-ink-3">이 응답은 지금의 문항 형식으로 표시할 수 없습니다 (문항이 바뀌었을 수 있습니다).</p> : this.props.children;
  }
}

function Verdict({ r }: { r: PastResponse }) {
  if (r.revealedBeforeAnswer && !r.answerPayload) return <Badge tone="outline">답 없이 공개</Badge>;
  const correct = r.grade?.gradable ? r.grade.isCorrect : r.isCorrect;
  if (correct === true) return <Badge tone="ok">정답</Badge>;
  if (correct === false) return <Badge tone="bad">오답</Badge>;
  return null;
}

export function PreviousResponsesPanel({ id, question, answerKey, items, loading, error, onRetry, hideRound }: {
  id: string;
  question: PublicQuestion;
  answerKey: Record<string, unknown> | null;
  items: PastResponse[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  hideRound: boolean;
}) {
  return (
    <section id={id} aria-label="이전 응답" className="rounded-md border border-line bg-elevated p-3 sm:p-4" data-testid="previous-responses">
      {loading ? <p role="status" className="flex items-center gap-1.5 text-[13px] text-ink-3"><Spinner className="h-3 w-3" />이전 응답을 불러오는 중…</p> : null}
      {error ? <p className="text-[13px] text-ink-3">이전 응답을 불러오지 못했습니다. <button type="button" className="text-accent hover:underline" onClick={onRetry}>다시 시도</button></p> : null}
      {!loading && !error && !items.length ? <p className="text-[13px] text-ink-3" data-testid="previous-responses-empty">이전 응답이 없습니다. 이 문제를 처음 풀었거나, 응답이 기록되기 전의 복습만 있습니다.</p> : null}
      <ol className="divide-y divide-line">
        {items.map((r, i) => {
          const rating = r.rating ? RATINGS[r.rating - 1] : undefined;
          return (
            <li key={r.id} className="space-y-2 py-3 first:pt-0 last:pb-0" data-testid="previous-response" data-kind={r.kind}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
                <span className="font-medium text-ink-2">{r.kind === 'practice' ? '연습' : hideRound ? `이전 복습 ${i + 1}` : `${r.reviewRound}회차`}</span>
                <span className="tabular">{formatDateTime(r.at)}</span>
                {rating ? <span className={cn('font-medium', rating.cls.split(' ')[1])}>{rating.ko}</span> : null}
                <Verdict r={r} />
                {r.hintUsed ? <Badge tone="outline">힌트</Badge> : null}
              </div>
              {r.answerPayload ? (
                <RenderGuard>
                  <QuestionRenderer question={question} value={r.answerPayload} onChange={() => {}} onSubmit={() => {}} phase="submitted" grade={r.grade} answerKey={answerKey} shuffleSeed={null} showKeyHints={false} readOnly compact />
                </RenderGuard>
              ) : (
                <p className="text-[13px] text-ink-3">{r.revealedBeforeAnswer ? '답을 입력하지 않고 정답을 공개했습니다.' : '이 회차의 응답은 기록되어 있지 않습니다.'}</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
