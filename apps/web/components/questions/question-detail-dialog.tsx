'use client';
import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { api, type CardInfo, type GradeResponse } from '@/lib/api';
import { STATUS_LABEL, TYPE_LABEL, cn, formatDateTime } from '@/lib/utils';
import Link from '@/components/ui/navigation-link';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ErrorState, LoadingState } from '@/components/ui/misc';
import { QuestionPrompt, QuestionRenderer } from './question-renderer';
import { ExplanationPanel } from '@/components/study/explanation-panel';

interface QuestionDetail {
  externalId: string;
  deckId: string;
  question: PublicQuestion;
  card: Omit<CardInfo, 'retrievability'> | null;
}

interface Review {
  id: string;
  rating: number;
  reviewedAt: string;
  isCorrect: boolean | null;
  reviewRound: number;
  undone: boolean;
  elapsedMs: number;
}

/** Inspect a question without starting a study session or writing a review. */
export function QuestionDetailDialog({ questionId, deckTitle, onClose }: { questionId: string; deckTitle: string; onClose: () => void }) {
  const opener = useRef<HTMLElement | null>(null);
  const detail = useQuery({
    queryKey: ['question-detail', questionId],
    queryFn: async () => {
      const [question, key] = await Promise.all([
        api<QuestionDetail>(`/questions/${encodeURIComponent(questionId)}`),
        api<Pick<GradeResponse, 'answerKey' | 'explanation'>>(`/questions/${encodeURIComponent(questionId)}/answer-key`),
      ]);
      return { ...question, ...key };
    },
  });
  const reviews = useQuery({ queryKey: ['reviews', questionId], queryFn: () => api<Review[]>(`/reviews?${new URLSearchParams({ questionId })}`) });
  const d = detail.data;
  const card = d?.card;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent title="문항 상세" description={deckTitle} wide data-testid="question-detail"
        onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
        {detail.isPending ? <LoadingState label="문항 상세를 불러오는 중…" /> : detail.isError ? (
          <ErrorState message={detail.error.message} onRetry={() => void detail.refetch()} />
        ) : d ? (
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
              <span>{d.externalId} · {TYPE_LABEL[d.question.type]}</span>
              <Link href={`/decks/${encodeURIComponent(d.deckId)}?q=${encodeURIComponent(d.externalId)}`} className="ml-auto text-accent underline underline-offset-4">덱에서 보기 →</Link>
            </div>
            <QuestionPrompt question={d.question} />
            <section aria-label="문제와 정답" className="min-w-0">
              <QuestionRenderer question={d.question} value={null} onChange={() => {}} onSubmit={() => {}}
                phase="revealed" grade={null} answerKey={d.answerKey} shuffleSeed={null} showKeyHints={false} readOnly />
            </section>
            <ExplanationPanel explanation={d.explanation} source={d.question.source} open />
            {card ? (
              <section aria-labelledby="question-card-info">
                <h3 id="question-card-info" className="mb-2 text-[13px] font-semibold text-ink-2">학습 정보</h3>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px]">
                  <dt className="text-ink-3">상태</dt><dd>{STATUS_LABEL[card.status] ?? card.status}{card.suspended ? ' · 보류' : ''}{card.flagged ? ' · 표시' : ''}</dd>
                  <dt className="text-ink-3">복습 / 실패</dt><dd>{card.reps}회 / {card.lapses}회</dd>
                  <dt className="text-ink-3">다음 복습</dt><dd>{formatDateTime(card.dueAt)}</dd>
                  <dt className="text-ink-3">마지막 복습</dt><dd>{card.lastReviewAt ? formatDateTime(card.lastReviewAt) : '없음'}</dd>
                </dl>
              </section>
            ) : null}
            <section aria-labelledby="question-review-history">
              <h3 id="question-review-history" className="mb-2 text-[13px] font-semibold text-ink-2">최근 복습 기록 <span className="font-normal text-ink-3">· 최대 100회</span></h3>
              {reviews.isPending ? <LoadingState label="복습 기록을 불러오는 중…" /> : reviews.isError ? (
                <ErrorState message={reviews.error.message} onRetry={() => void reviews.refetch()} />
              ) : reviews.data?.length ? (
                <ul className="max-h-60 space-y-2 overflow-y-auto text-[13px]" aria-label="최근 복습 기록">
                  {reviews.data.map((r) => (
                    <li key={r.id} className={cn('flex flex-wrap gap-x-3 gap-y-1 tabular', r.undone && 'line-through opacity-50')}>
                      <span>{r.reviewRound}회차</span><span>{['', '다시', '어려움', '보통', '쉬움'][r.rating]}</span>
                      <span>{r.isCorrect === null ? '정오답 없음' : r.isCorrect ? '정답' : '오답'}</span>
                      <span className="text-ink-3">{formatDateTime(r.reviewedAt)}</span><span className="text-ink-3">{Math.round(r.elapsedMs / 1000)}초</span>
                      {r.undone ? <span>되돌린 기록</span> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-ink-3">아직 복습 기록이 없습니다.</p>}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
