import { cn } from '@/lib/utils';

const tones = {
  neutral: 'bg-muted text-ink-2 border-line',
  accent: 'bg-accent-soft text-accent-soft-ink border-transparent',
  ok: 'bg-ok-soft text-ok-ink border-transparent',
  bad: 'bg-bad-soft text-bad-ink border-transparent',
  warn: 'bg-warn-soft text-warn-ink border-transparent',
  info: 'bg-info-soft text-ink border-transparent',
  outline: 'bg-transparent text-ink-2 border-line-strong',
} as const;

export function Badge({ tone = 'neutral', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium leading-5 whitespace-nowrap', tones[tone], className)} {...props} />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn('kbd', className)}>{children}</kbd>;
}
