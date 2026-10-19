'use client';
/** Small dependency-free SVG charts. One data hue (accent); color on data, not chrome. */
import { cn } from '@/lib/utils';

export interface BarDatum { label: string; value: number; secondary?: number }

/** Round a maximum up to a tick-friendly step so the top tick sits above the data. */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow === max ? max : Math.ceil(max / (step * pow / 2)) * (step * pow / 2);
}

/**
 * Column chart with a y-scale (0 / half / max), square-cornered bars on the baseline, flat x labels.
 * `secondary` draws a second value (e.g. correct answers) inside the first bar; name it with `legend`.
 */
export function BarChart({ data, height = 140, labelEvery = 7, format = (v: number) => String(v), secondary, legend, className, ariaLabel }: { data: BarDatum[]; height?: number; labelEvery?: number; format?: (v: number) => string; secondary?: boolean; legend?: { primary: string; secondary: string }; className?: string; ariaLabel: string }) {
  const rawMax = Math.max(0, ...data.map((d) => Math.max(d.value, d.secondary ?? 0)));
  const max = niceMax(rawMax);
  const w = 100 / Math.max(1, data.length);
  const plotH = height - 8;
  const y = (v: number) => plotH - (plotH * v) / max;
  return (
    <div className={cn('w-full', className)}>
      {legend ? (
        <div className="mb-2 flex flex-wrap gap-x-3 text-[12px] text-ink-3">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-accent" aria-hidden /> {legend.primary}</span>
          {secondary ? <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-ok" aria-hidden /> {legend.secondary}</span> : null}
        </div>
      ) : null}
      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        <div className="relative w-7 text-right" style={{ height }} aria-hidden>
          {[max, max / 2, 0].map((t) => <span key={t} className="chart-tick absolute right-0 -translate-y-1/2" style={{ top: y(t) }}>{format(t)}</span>)}
        </div>
        <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label={ariaLabel}>
          {[max, max / 2].map((t) => <line key={t} x1={0} x2={100} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />)}
          <line x1={0} x2={100} y1={plotH} y2={plotH} stroke="var(--line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {data.map((d, i) => {
            const hh = plotH - y(d.value);
            const sh = secondary && d.secondary !== undefined ? plotH - y(d.secondary) : 0;
            return (
              <g key={d.label}>
                <rect x={i * w + w * 0.15} y={plotH - hh} width={w * 0.7} height={hh} fill="var(--accent)">
                  <title>{d.label}: {format(d.value)}{d.secondary !== undefined ? ` / ${format(d.secondary)}` : ''}</title>
                </rect>
                {secondary && sh > 0 ? <rect x={i * w + w * 0.15} y={plotH - sh} width={w * 0.7} height={sh} fill="var(--ok)" /> : null}
              </g>
            );
          })}
        </svg>
        <div />
        <div className="relative h-4">
          {data.map((d, i) => (i % labelEvery === 0 ? <span key={d.label} className="chart-tick absolute top-1" style={{ left: `${i * w}%` }}>{d.label.slice(5)}</span> : null))}
        </div>
      </div>
    </div>
  );
}

export interface HBarRow { label: string; value: number; hint?: string; tone?: 'accent' | 'bad' | 'ok' | 'warn'; /** Printed instead of format(value); use '—' for a missing value. */ display?: string }

/** Sorted-or-ordered horizontal bar list: label, track, value. A missing value prints as a grey dash with no bar. */
export function HBar({ rows, format = (v: number) => String(v), className }: { rows: HBarRow[]; format?: (v: number) => string; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const tone = { accent: 'bg-accent', bad: 'bg-bad', ok: 'bg-ok', warn: 'bg-warn' };
  return (
    <ul className={cn('space-y-1.5', className)}>
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-[13px]">
          <span className="truncate text-ink-2">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-sm bg-muted"><span className={cn('block h-full', tone[r.tone ?? 'accent'])} style={{ width: `${r.display === '—' ? 0 : (r.value / max) * 100}%` }} /></span>
          <span className={cn('tabular', r.display === '—' ? 'text-ink-3' : 'text-ink-2')}>{r.display ?? format(r.value)}{r.hint ? <span className="ml-1 text-[11px] text-ink-3">{r.hint}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}
