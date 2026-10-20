'use client';
import { Eye, EyeOff } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { slotState, type MetaControl, type MetaKey } from './meta-mask';

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

/**
 * One metadata slot under the study mask. Without a `control` it renders `children` as-is (exam, deck pages).
 * With one it is a toggle: visible → click hides the item (saved), masked → chip, click shows it again (saved),
 * and, while the answer is open with "reveal on answer", shown temporarily with a note that it is still hidden.
 */
export function MetaChip({ k, label, control, testId, className, children }: { k: MetaKey; label: string; control?: MetaControl; testId?: string; className?: string; children: React.ReactNode }) {
  const state = slotState(control, k);
  if (!control) return <span className={className} data-testid={testId}>{children}</span>;
  if (state === 'masked') return <MaskedChip label={label} onReveal={() => control.onToggle(k)} testId={testId} className={className} />;
  if (state === 'revealed') {
    return (
      <Tooltip content={<>정답 공개로 임시 표시 중 · 다음 문제부터 다시 가려집니다</>}>
        <span className={cn('inline-flex items-center gap-1 rounded-sm border-b border-dotted border-line-strong', className)} data-testid={testId} data-meta-state="revealed" aria-label={`${label} (정답 공개로 임시 표시)`}>
          <Eye className="h-3 w-3 text-ink-3" aria-hidden />{children}
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={<>클릭하면 {label} 가리기 (설정에 저장)</>}>
      <button type="button" onClick={() => control.onToggle(k)} className={cn('inline-flex items-center gap-1 rounded-sm text-left decoration-dotted underline-offset-2 transition-colors hover:text-ink hover:underline', className)} data-testid={testId} data-meta-state="visible" aria-label={`${label} — 클릭하면 가리기`}>{children}</button>
    </Tooltip>
  );
}
