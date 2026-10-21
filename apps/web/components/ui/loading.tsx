'use client';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cn('h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none', className)} />;
}

/** Unknown durations stay indeterminate; only measured work supplies a percentage. */
export function ProgressBar({ value, label = '처리 진행 중', className }: { value?: number; label?: string; className?: string }) {
  const progress = value !== undefined && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : undefined;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className={cn('relative h-1 overflow-hidden rounded-full bg-accent/15', className)}>
      <span className={cn('block h-full bg-accent', progress === undefined ? 'rs-progress-indeterminate w-1/3' : 'transition-[width] duration-200 motion-reduce:transition-none')} style={progress === undefined ? undefined : { width: `${progress}%` }} />
    </div>
  );
}

export function LoadingState({ label = '데이터를 불러오는 중…', detail, className }: { label?: string; detail?: string; className?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSlow(true), 6_000); return () => clearTimeout(timer); }, []);
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn('flex min-h-32 flex-col justify-center gap-3 rounded-lg border border-line bg-elevated px-5 py-6', className)}>
      <div className="flex items-center gap-2 text-sm text-ink-2"><Spinner className="text-accent" /><span>{label}</span></div>
      {slow || detail ? <p className="text-[12px] text-ink-3">{slow ? '서버 응답을 기다리고 있습니다. 잠시만 기다려 주세요.' : detail}</p> : null}
      <ProgressBar label={label} />
    </div>
  );
}
