'use client';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { CalendarDays, CircleHelp, Layers, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * How many times this card has come up: in this session (re-queued after Again), today (across sessions and devices)
 * and in total (the review round). Compact icon + number; the "?" button explains each count.
 */
export function AttemptCounters({ session, today, total }: { session: number; today: number; total: number }) {
  const items = [
    { key: 'session', icon: Repeat, value: session, label: `이번 세션 ${session}번째`, hot: session > 1 },
    { key: 'today', icon: CalendarDays, value: today, label: `오늘 ${today}번째`, hot: today > 1 },
    { key: 'total', icon: Layers, value: total, label: `누적 ${total}회차`, hot: false },
  ] as const;
  return (
    <span className="inline-flex items-center gap-2.5 tabular" data-testid="attempt-counters">
      {items.map(({ key, icon: Icon, value, label, hot }) => (
        <span key={key} className={cn('inline-flex items-center gap-0.5', hot && 'font-medium text-warn')} title={label} aria-label={label} data-testid={`attempt-${key}`} data-value={value}>
          <Icon className="h-3.5 w-3.5" aria-hidden />{value}
        </span>
      ))}
    </span>
  );
}

/** Kept outside the maskable chip (a button inside its toggle button would nest). */
export function AttemptCountersHelp() {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" className="-m-1 inline-grid h-6 w-6 place-items-center rounded text-ink-3 hover:bg-muted hover:text-ink" aria-label="풀이 횟수 표시 설명" data-testid="attempt-help">
          <CircleHelp className="h-3.5 w-3.5" aria-hidden />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align="start" sideOffset={6} className="z-50 w-[280px] rounded-lg border border-line bg-elevated p-3 text-[13px] text-ink-2 shadow-card rs-pop" data-testid="attempt-help-content">
          <p className="mb-2 font-medium text-ink">이 카드를 몇 번째 푸는지</p>
          <ul className="space-y-1.5">
            <li className="flex gap-2"><Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span><strong className="text-ink">이번 세션</strong>: ‘다시’로 세션 끝에 다시 돌아온 횟수를 포함해 이 세션에서 몇 번째인지</span></li>
            <li className="flex gap-2"><CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span><strong className="text-ink">오늘</strong>: 세션·기기와 상관없이 오늘(자정 기준) 몇 번째 평가인지</span></li>
            <li className="flex gap-2"><Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span><strong className="text-ink">누적 회차</strong>: 처음 본 날부터 지금까지의 평가 횟수 + 1 (되돌린 평가 제외)</span></li>
          </ul>
          <p className="mt-2 text-[12px] text-ink-3">2번째 이상이면 주황색으로 표시됩니다. 메타 가리기의 ‘회차’를 켜면 함께 가려집니다.</p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
