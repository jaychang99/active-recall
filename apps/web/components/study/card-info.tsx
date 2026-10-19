'use client';
import type { CardInfo } from '@/lib/api';
import { STATUS_LABEL, formatDateTime, pct, relativeDue } from '@/lib/utils';

export function CardInfoTable({ card, round }: { card: CardInfo; round: number }) {
  const rows: [string, string][] = [
    ['상태', STATUS_LABEL[card.status] ?? card.status],
    ['회차', `${round}회차 (복습 ${card.reps}회, 실패 ${card.lapses}회)`],
    ['예정', `${formatDateTime(card.dueAt)} (${relativeDue(card.dueAt)})`],
    ['마지막 복습', card.lastReviewAt ? formatDateTime(card.lastReviewAt) : '—'],
    ['FSRS 안정성', card.stability ? `${card.stability.toFixed(1)}일` : '—'],
    ['FSRS 난이도', card.difficulty ? card.difficulty.toFixed(2) : '—'],
    ['예상 기억 확률', card.retrievability === null ? '—' : pct(card.retrievability)],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="tabular">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
