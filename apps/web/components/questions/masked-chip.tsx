'use client';
import { EyeOff } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Stand-in for a hidden metadata value. It keeps the slot visible (so the learner knows something is
 * masked rather than missing) and, when `onReveal` is given, clicking it shows the item again.
 */
export function MaskedChip({ label, onReveal, className, testId }: { label: string; onReveal?: () => void; className?: string; testId?: string }) {
  const body = (
    <span className="inline-flex items-center gap-1">
      <EyeOff className="h-3 w-3" aria-hidden />
      <span>{label}</span>
      <span className="tracking-[0.15em] text-ink-3/70" aria-hidden>•••</span>
    </span>
  );
  const cls = cn('inline-flex h-5 items-center rounded-full border border-dashed border-line-strong px-2 text-[11px] text-ink-3 select-none', className);
  if (!onReveal) return <span className={cls} data-testid={testId} data-masked="true" aria-label={`${label} 가려짐`}>{body}</span>;
  return (
    <Tooltip content={<>{label} 가려짐 · 클릭하면 다시 표시 (설정에 저장)</>}>
      <button type="button" onClick={onReveal} className={cn(cls, 'cursor-pointer transition-colors hover:border-accent hover:text-ink-2')} data-testid={testId} data-masked="true" aria-label={`${label} 가려짐 — 클릭하면 다시 표시`}>{body}</button>
    </Tooltip>
  );
}
