import { cn } from '@/lib/utils';

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0 rounded-lg border border-line bg-elevated', className)} {...props} />;
}

export function PageHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-line-strong px-6 py-8">
      {icon ? <div className="text-ink-3">{icon}</div> : null}
      <div>
        <p className="font-medium">{title}</p>
        {body ? <p className="mt-1 max-w-prose text-sm text-ink-3">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ title = '불러오지 못했습니다', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-bad/40 bg-bad-soft/40 px-4 py-3 text-sm">
      <p className="font-medium text-bad-ink">{title}</p>
      {message ? <p className="mt-0.5 text-ink-2">{message}</p> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-2 text-accent underline underline-offset-4">
          다시 시도
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

/** Headline figure. `lead` marks the one figure that answers the screen's question (1.3x its siblings). A dash is a missing value and stays grey. */
export function Stat({ label, value, hint, lead, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; lead?: boolean; className?: string }) {
  const missing = value === '—';
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className={cn('mt-0.5 font-semibold tabular leading-none', lead ? 'text-[32px]' : 'text-2xl', missing && 'text-ink-3')}>{value}</div>
      {hint ? <div className="mt-1 text-[12px] text-ink-3">{hint}</div> : null}
    </div>
  );
}

/** Segmented bar: new / learning / review / relearning. Text labels accompany color. */
export function ProgressStrip({ p, className }: { p: { total: number; new: number; learning: number; review: number; relearning: number }; className?: string }) {
  const total = Math.max(1, p.total);
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div style={{ width: seg(p.review) }} className="bg-accent" />
        <div style={{ width: seg(p.learning + p.relearning) }} className="bg-warn" />
        <div style={{ width: seg(p.new) }} className="bg-line-strong" />
      </div>
      <div className="flex flex-wrap gap-x-3 text-[11px] text-ink-3 tabular">
        <span><span className="inline-block h-2 w-2 rounded-sm bg-accent align-middle" /> 복습 {p.review}</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-warn align-middle" /> 학습중 {p.learning + p.relearning}</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-line-strong align-middle" /> 새 카드 {p.new}</span>
      </div>
    </div>
  );
}
