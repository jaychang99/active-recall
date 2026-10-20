'use client';
import DOMPurify from 'dompurify';
import { Check, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { pointInShape, type HotspotRegion, type PublicQuestion } from '@recall/contracts';
import { cn } from '@/lib/utils';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'image_hotspot' }>;
type Pt = { x: number; y: number };

const SANITIZE = { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['script', 'foreignObject'], FORBID_ATTR: ['onload', 'onclick', 'href', 'xlink:href'] };

/** Click the target area(s) on an image. Coordinates are normalized to the rendered image box (0..1), so the answer
 *  key's regions (revealed after grading) overlay exactly. Up to `answer.count` markers; clicking a marker removes
 *  it, and a further click replaces the oldest. Regions are never in the public question. */
export function ImageHotspot({ question, value, onChange, phase, grade, answerKey, readOnly }: RendererProps<Q>) {
  const points = value?.type === 'image_hotspot' ? value.points : [];
  const revealed = phase !== 'answering';
  const count = question.answer.count;
  const box = useRef<HTMLDivElement>(null);
  const clean = useMemo(() => (question.image.svg ? DOMPurify.sanitize(question.image.svg, SANITIZE) : ''), [question.image.svg]);
  const regions = ((answerKey?.regions as HotspotRegion[] | undefined) ?? []);
  const expectedIds = new Set(((answerKey?.answer as { regionIds?: string[] } | undefined)?.regionIds ?? []) as string[]);
  const expected = regions.filter((r) => expectedIds.has(r.id));
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const hitRegion = (p: Pt) => expected.find((r) => pointInShape(p, r.shape));

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (revealed || readOnly || !box.current) return;
    const rect = box.current.getBoundingClientRect();
    const p = { x: +((e.clientX - rect.left) / rect.width).toFixed(4), y: +((e.clientY - rect.top) / rect.height).toFixed(4) };
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
    const near = points.findIndex((q) => Math.hypot((q.x - p.x) * rect.width, (q.y - p.y) * rect.height) < 14);
    if (near >= 0) { onChange({ type: 'image_hotspot', points: points.filter((_, i) => i !== near) }); return; }
    const next = points.length >= count ? [...points.slice(1), p] : [...points, p];
    onChange({ type: 'image_hotspot', points: next });
  };

  return (
    <div className="space-y-2">
      {!revealed ? <p className="text-[12px] text-ink-3">그림에서 해당 위치를 클릭하세요 (마커 {count}개). 마커를 다시 클릭하면 지워집니다.</p> : null}
      <div className="inline-block max-w-full overflow-hidden rounded-md border border-line bg-elevated">
        <div ref={box} role={revealed ? undefined : 'button'} tabIndex={revealed ? -1 : 0} aria-label={question.image.alt} data-testid="hotspot-image" onClick={onClick}
          className={cn('relative inline-block max-w-full select-none leading-none', !revealed && !readOnly && 'cursor-crosshair')}>
          {question.image.svg ? (
            <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: clean }} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary external/data URL from question content
            <img src={question.image.url} alt={question.image.alt} draggable={false} className="block h-auto max-w-full" />
          )}
          {revealed ? (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
              {expected.map((r) => {
                const hit = parts.get(r.id)?.correct;
                const cls = hit ? 'fill-ok/25 stroke-ok' : 'fill-ok/10 stroke-ok [stroke-dasharray:0.01]';
                const s = r.shape;
                if (s.kind === 'rect') return <rect key={r.id} x={s.x} y={s.y} width={s.w} height={s.h} vectorEffect="non-scaling-stroke" strokeWidth={2} className={cls} />;
                if (s.kind === 'circle') return <ellipse key={r.id} cx={s.cx} cy={s.cy} rx={s.r} ry={s.r} vectorEffect="non-scaling-stroke" strokeWidth={2} className={cls} />;
                return <polygon key={r.id} points={s.points.map(([x, y]) => `${x},${y}`).join(' ')} vectorEffect="non-scaling-stroke" strokeWidth={2} className={cls} />;
              })}
            </svg>
          ) : null}
          {points.map((p, i) => {
            const ok = revealed ? !!hitRegion(p) : null;
            return (
              <span key={i} data-testid="hotspot-marker" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                className={cn('absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-[11px] font-bold shadow', ok === null ? 'border-accent bg-accent text-accent-ink' : ok ? 'border-ok bg-ok text-accent-ink' : 'border-bad bg-bad text-accent-ink')}>
                {i + 1}
              </span>
            );
          })}
          {revealed ? expected.map((r) => (
            <span key={`lbl-${r.id}`} style={labelPos(r)} className="absolute -translate-y-full rounded bg-ok px-1.5 py-0.5 text-[11px] font-medium text-accent-ink shadow">{r.label ?? r.id}</span>
          )) : null}
        </div>
      </div>
      {revealed ? (
        <p className={cn('flex items-center gap-1 text-[13px] font-medium', grade?.isCorrect ? 'text-ok-ink' : 'text-bad-ink')}>
          {grade?.isCorrect ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {grade?.isCorrect ? '정답 영역을 모두 맞혔습니다' : `정답 영역 ${expected.filter((r) => parts.get(r.id)?.correct).length}/${expected.length} · 초록 영역이 정답`}
        </p>
      ) : null}
    </div>
  );
}

function labelPos(r: HotspotRegion): React.CSSProperties {
  const s = r.shape;
  if (s.kind === 'rect') return { left: `${s.x * 100}%`, top: `${s.y * 100}%` };
  if (s.kind === 'circle') return { left: `${(s.cx - s.r) * 100}%`, top: `${(s.cy - s.r) * 100}%` };
  const xs = s.points.map((p) => p[0]);
  const ys = s.points.map((p) => p[1]);
  return { left: `${Math.min(...xs) * 100}%`, top: `${Math.min(...ys) * 100}%` };
}
