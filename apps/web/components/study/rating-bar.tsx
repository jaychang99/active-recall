'use client';
import type { IntervalPreview } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/loading';

export const RATINGS = [
  { value: 1, key: 'again', label: 'Again', ko: '다시', cls: 'border-again text-again', fill: 'bg-again' },
  { value: 2, key: 'hard', label: 'Hard', ko: '어려움', cls: 'border-hard text-hard', fill: 'bg-hard' },
  { value: 3, key: 'good', label: 'Good', ko: '보통', cls: 'border-good text-good', fill: 'bg-good' },
  { value: 4, key: 'easy', label: 'Easy', ko: '쉬움', cls: 'border-easy text-easy', fill: 'bg-easy' },
] as const;

/** The signature control: four FSRS grades with the resulting interval under each. */
/** `blocked`: grades that cannot be given right now (e.g. Easy after a wrong answer), with the reason as their tooltip. */
export function RatingBar({ preview, onRate, disabled, pending, blocked }: { preview: IntervalPreview | null; onRate: (rating: 1 | 2 | 3 | 4) => void; disabled?: boolean; pending?: 1 | 2 | 3 | 4 | null; blocked?: { ratings: readonly number[]; reason: string } }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="회상 난이도 평가" data-testid="rating-bar">
      {RATINGS.map((r) => {
        const isBlocked = !!blocked?.ratings.includes(r.value);
        return (
        <button
          key={r.value}
          type="button"
          disabled={disabled || isBlocked}
          onClick={() => onRate(r.value)}
          data-rating={r.value}
          data-blocked={isBlocked || undefined}
          title={isBlocked ? blocked!.reason : undefined}
          aria-label={`${r.ko} (${r.label}) — ${isBlocked ? blocked!.reason : (preview?.[r.key].interval ?? '')}`}
          aria-busy={pending === r.value || undefined}
          className={cn(
            'group relative flex flex-col items-center gap-0.5 rounded-md border bg-elevated px-2 py-2.5 transition-colors hover:bg-muted disabled:opacity-60',
            r.cls,
            isBlocked && 'cursor-not-allowed border-dashed opacity-40 hover:bg-elevated disabled:opacity-40',
            pending === r.value && 'bg-muted ring-2 ring-current',
          )}
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <kbd className="kbd" aria-hidden>{r.value}</kbd>
            {r.ko}
          </span>
          <span className="flex items-center gap-1 text-[12px] tabular text-ink-3">{pending === r.value ? <><Spinner className="h-3 w-3" /> 저장 중</> : isBlocked ? '막힘' : preview ? preview[r.key].interval : r.label}</span>
        </button>
        );
      })}
    </div>
  );
}
