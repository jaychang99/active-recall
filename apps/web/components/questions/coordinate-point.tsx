'use client';
import { Check, X } from 'lucide-react';
import { useRef } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { cn } from '@/lib/utils';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'coordinate_point' }>;
type Pt = { x: number; y: number };

const W = 400;
const H = 400;
const PAD = 28;

/** Place `answer.count` points on a coordinate plane by clicking (snapped to the grid unless `plane.snap` is false).
 *  Clicking an existing point removes it; one more click than allowed replaces the oldest. Expected points are drawn
 *  after grading. */
export function CoordinatePoint({ question, value, onChange, phase, grade, answerKey, readOnly }: RendererProps<Q>) {
  const points = value?.type === 'coordinate_point' ? value.points : [];
  const revealed = phase !== 'answering';
  const count = question.answer.count;
  const { xMin, xMax, yMin, yMax, xStep = 1, yStep = 1, xLabel, yLabel, snap = true } = question.plane;
  const svg = useRef<SVGSVGElement>(null);
  const sx = (x: number) => PAD + ((x - xMin) / (xMax - xMin)) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - ((y - yMin) / (yMax - yMin)) * (H - 2 * PAD);
  const expected = ((answerKey?.answer as { points?: { id: string; x: number; y: number; label?: string; tolerance?: number }[] } | undefined)?.points ?? []) as { id: string; x: number; y: number; label?: string; tolerance?: number }[];
  const parts = grade?.detail.parts ?? [];
  const matchedGiven = new Set(parts.filter((p) => p.correct).map((p) => p.given));
  const fmt = (p: Pt) => `(${p.x}, ${p.y})`;
  const round = (v: number, step: number) => Math.round(v / step) * step;
  const clean = (v: number) => +v.toFixed(6);

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (revealed || readOnly || !svg.current) return;
    const rect = svg.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    let x = xMin + ((px - PAD) / (W - 2 * PAD)) * (xMax - xMin);
    let y = yMin + ((H - PAD - py) / (H - 2 * PAD)) * (yMax - yMin);
    if (snap) { x = round(x, xStep); y = round(y, yStep); }
    x = clean(Math.max(xMin, Math.min(xMax, x)));
    y = clean(Math.max(yMin, Math.min(yMax, y)));
    const near = points.findIndex((q) => Math.hypot(sx(q.x) - sx(x), sy(q.y) - sy(y)) < 10);
    if (near >= 0) { onChange({ type: 'coordinate_point', points: points.filter((_, i) => i !== near) }); return; }
    onChange({ type: 'coordinate_point', points: points.length >= count ? [...points.slice(1), { x, y }] : [...points, { x, y }] });
  };

  const xs = ticks(xMin, xMax, xStep);
  const ys = ticks(yMin, yMax, yStep);
  const labelEvery = (n: number) => Math.max(1, Math.ceil(n / 12));

  return (
    <div className="space-y-2">
      {!revealed ? <p className="text-[12px] text-ink-3">좌표평면을 클릭해 점 {count}개를 찍으세요{snap ? ' (격자에 맞춰짐)' : ''}. 점을 다시 클릭하면 지워집니다.</p> : null}
      <div className="flex flex-wrap items-start gap-4">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role={revealed ? 'img' : 'button'} aria-label="좌표평면" tabIndex={revealed ? -1 : 0} onClick={onClick} data-testid="coordinate-plane"
          className={cn('h-auto w-full max-w-[400px] touch-manipulation rounded-md border border-line bg-elevated', !revealed && !readOnly && 'cursor-crosshair')}>
          {xs.map((x) => <line key={`gx${x}`} x1={sx(x)} x2={sx(x)} y1={PAD} y2={H - PAD} className="stroke-line" strokeWidth={1} />)}
          {ys.map((y) => <line key={`gy${y}`} y1={sy(y)} y2={sy(y)} x1={PAD} x2={W - PAD} className="stroke-line" strokeWidth={1} />)}
          {xMin <= 0 && xMax >= 0 ? <line x1={sx(0)} x2={sx(0)} y1={PAD} y2={H - PAD} className="stroke-ink-3" strokeWidth={1.5} /> : null}
          {yMin <= 0 && yMax >= 0 ? <line y1={sy(0)} y2={sy(0)} x1={PAD} x2={W - PAD} className="stroke-ink-3" strokeWidth={1.5} /> : null}
          {xs.map((x, i) => (i % labelEvery(xs.length) === 0 ? <text key={`tx${x}`} x={sx(x)} y={H - PAD + 14} textAnchor="middle" className="fill-ink-3 text-[10px] tabular">{clean(x)}</text> : null))}
          {ys.map((y, i) => (i % labelEvery(ys.length) === 0 ? <text key={`ty${y}`} x={PAD - 6} y={sy(y) + 3} textAnchor="end" className="fill-ink-3 text-[10px] tabular">{clean(y)}</text> : null))}
          {xLabel ? <text x={W - PAD} y={H - 6} textAnchor="end" className="fill-ink-2 text-[11px] font-medium">{xLabel}</text> : null}
          {yLabel ? <text x={PAD} y={PAD - 10} textAnchor="start" className="fill-ink-2 text-[11px] font-medium">{yLabel}</text> : null}
          {revealed ? expected.map((p) => (
            <g key={p.id}>
              {p.tolerance ? <circle cx={sx(p.x)} cy={sy(p.y)} r={(p.tolerance / (xMax - xMin)) * (W - 2 * PAD)} className="fill-ok/10 stroke-ok" strokeDasharray="3 3" /> : null}
              <circle cx={sx(p.x)} cy={sy(p.y)} r={7} className="fill-none stroke-ok" strokeWidth={2} />
              <text x={sx(p.x) + 9} y={sy(p.y) - 8} className="fill-ok-ink text-[11px] font-medium">{p.label ?? fmt(p)}</text>
            </g>
          )) : null}
          {points.map((p, i) => {
            const ok = revealed ? matchedGiven.has(fmt(p)) : null;
            return (
              <g key={i} data-testid="plane-point">
                <circle cx={sx(p.x)} cy={sy(p.y)} r={5.5} className={cn(ok === null ? 'fill-accent' : ok ? 'fill-ok' : 'fill-bad')} />
                <text x={sx(p.x) + 8} y={sy(p.y) + 12} className="fill-ink-2 text-[10px] tabular">{fmt(p)}</text>
              </g>
            );
          })}
        </svg>
        <ul className="min-w-[8rem] space-y-1 text-[13px] tabular" aria-label="찍은 점">
          {points.map((p, i) => {
            const ok = revealed ? matchedGiven.has(fmt(p)) : null;
            return <li key={i} className={cn('flex items-center gap-1', ok === true && 'text-ok-ink', ok === false && 'text-bad-ink')}>{ok === true ? <Check className="h-3.5 w-3.5" /> : ok === false ? <X className="h-3.5 w-3.5" /> : <span className="inline-block h-2 w-2 rounded-full bg-accent" />}{fmt(p)}</li>;
          })}
          {points.length === 0 ? <li className="text-ink-3">아직 찍은 점이 없습니다</li> : null}
          {revealed ? expected.filter((p) => !parts.find((x) => x.id === p.id)?.correct).map((p) => <li key={p.id} className="text-ink-2">놓침: {p.label ? `${p.label} ` : ''}{fmt(p)}</li>) : null}
        </ul>
      </div>
    </div>
  );
}

function ticks(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  const n = Math.floor((max - min) / step + 1e-9);
  if (n > 200) return [min, max];
  for (let i = 0; i <= n; i++) out.push(+(min + i * step).toFixed(6));
  return out;
}
