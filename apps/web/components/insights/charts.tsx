'use client';
/** Small dependency-free SVG charts. One data hue (accent); color on data, not chrome. */
import { cn } from '@/lib/utils';

export function BarChart({ data, height = 140, labelEvery = 7, format = (v: number) => String(v), secondary, className, ariaLabel }: { data: { label: string; value: number; secondary?: number }[]; height?: number; labelEvery?: number; format?: (v: number) => string; secondary?: boolean; className?: string; ariaLabel: string }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.secondary ?? 0)));
  const w = 100 / Math.max(1, data.length);
  return (
    <div className={cn('w-full', className)}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-[140px] w-full" role="img" aria-label={ariaLabel}>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={0} x2={100} y1={height - 18 - (height - 24) * g} y2={height - 18 - (height - 24) * g} stroke="var(--line)" strokeWidth={0.3} />)}
        {data.map((d, i) => {
          const hh = ((height - 24) * d.value) / max;
          const sh = secondary && d.secondary !== undefined ? ((height - 24) * d.secondary) / max : 0;
          return (
            <g key={d.label}>
              <rect x={i * w + w * 0.15} y={height - 18 - hh} width={w * 0.7} height={hh} fill="var(--accent)" rx={0.5}>
                <title>{d.label}: {format(d.value)}{d.secondary !== undefined ? ` / ${format(d.secondary)}` : ''}</title>
              </rect>
              {secondary && sh > 0 ? <rect x={i * w + w * 0.15} y={height - 18 - sh} width={w * 0.7} height={sh} fill="var(--ok)" opacity={0.85} rx={0.5} /> : null}
            </g>
          );
        })}
      </svg>
      <div className="relative h-4 text-[10px] text-ink-3 tabular">
        {data.map((d, i) => (i % labelEvery === 0 ? <span key={d.label} className="absolute" style={{ left: `${i * w}%` }}>{d.label.slice(5)}</span> : null))}
      </div>
    </div>
  );
}

export function HBar({ rows, format = (v: number) => String(v), className }: { rows: { label: string; value: number; hint?: string; tone?: 'accent' | 'bad' | 'ok' | 'warn' }[]; format?: (v: number) => string; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const tone = { accent: 'bg-accent', bad: 'bg-bad', ok: 'bg-ok', warn: 'bg-warn' };
  return (
    <ul className={cn('space-y-1.5', className)}>
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-[13px]">
          <span className="truncate text-ink-2">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-sm bg-sunken"><span className={cn('block h-full', tone[r.tone ?? 'accent'])} style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="tabular text-ink-2">{format(r.value)}{r.hint ? <span className="ml-1 text-[11px] text-ink-3">{r.hint}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}
