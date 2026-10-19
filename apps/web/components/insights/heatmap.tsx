'use client';
import { useQuery } from '@tanstack/react-query';
import { api, type Heatmap } from '@/lib/api';
import { Skeleton } from '@/components/ui/misc';

/** GitHub-style activity calendar. Each cell = reviews in a day; intensity scaled to the max. */
export function ActivityHeatmap({ days = 364, compact, deckId, subject }: { days?: number; compact?: boolean; deckId?: string; subject?: string }) {
  const qs = new URLSearchParams({ days: String(days) });
  if (deckId) qs.set('deckId', deckId);
  if (subject) qs.set('subject', subject);
  const q = useQuery({ queryKey: ['heatmap', days, deckId ?? null, subject ?? null], queryFn: () => api<Heatmap>(`/analytics/heatmap?${qs.toString()}`) });
  if (q.isLoading) return <Skeleton className={compact ? 'h-20' : 'h-28'} />;
  if (!q.data) return null;
  const list = q.data.days;
  const first = new Date(list[0]!.day + 'T00:00:00Z');
  const offset = first.getUTCDay();
  const weeks: { day: string; count: number }[][] = [];
  let col: { day: string; count: number }[] = Array.from({ length: offset }, () => ({ day: '', count: -1 }));
  for (const d of list) {
    col.push(d);
    if (col.length === 7) { weeks.push(col); col = []; }
  }
  if (col.length) weeks.push(col);
  const max = Math.max(1, q.data.max);
  const level = (c: number) => (c <= 0 ? 0 : c < max * 0.25 ? 1 : c < max * 0.5 ? 2 : c < max * 0.75 ? 3 : 4);
  const colors = ['var(--bg-sunken)', 'color-mix(in oklab, var(--accent) 25%, var(--bg-elevated))', 'color-mix(in oklab, var(--accent) 50%, var(--bg-elevated))', 'color-mix(in oklab, var(--accent) 75%, var(--bg-elevated))', 'var(--accent)'];
  const size = compact ? 9 : 11;
  const gap = 2;
  const w = weeks.length * (size + gap) - gap;
  const h = 7 * (size + gap) - gap;
  // viewBox scaling keeps the cells square at any container width (no inner scroll).
  return (
    <div className="min-w-0">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: compact ? w : w * 1.6, height: 'auto' }} role="img" aria-label={`최근 ${days}일 복습 활동, 최대 하루 ${q.data.max}회`} className="block">
        {weeks.map((week, x) => week.map((d, y) => d.count < 0 ? null : (
          <rect key={d.day} x={x * (size + gap)} y={y * (size + gap)} width={size} height={size} rx={2} fill={colors[level(d.count)]}>
            <title>{d.day}: {d.count}회</title>
          </rect>
        )))}
      </svg>
      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-3">적음 {colors.map((c, i) => <span key={i} className="inline-block h-2.5 w-2.5 rounded-sm border border-line" style={{ background: c }} />)} 많음 · 최대 {q.data.max}회/일</div>
    </div>
  );
}
