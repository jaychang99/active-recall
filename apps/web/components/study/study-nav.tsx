'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RATINGS } from './rating-bar';

export type NavStatus = 'todo' | 'draft' | 'answered' | 'rated';
export interface NavCell { status: NavStatus; rating?: 1 | 2 | 3 | 4 }

const STATUS_LABEL: Record<NavStatus, string> = { todo: '아직 안 봄', draft: '작성 중', answered: '답 확인', rated: '평가 완료' };

function cellClass(c: NavCell) {
  if (c.status === 'rated' && c.rating) return RATINGS[c.rating - 1]!.fill;
  if (c.status === 'answered') return 'bg-accent/60';
  if (c.status === 'draft') return 'bg-line-strong';
  return 'bg-transparent';
}

function describe(i: number, c: NavCell) {
  return `${i + 1}번 · ${c.status === 'rated' && c.rating ? `평가 ${RATINGS[c.rating - 1]!.ko}` : STATUS_LABEL[c.status]}`;
}

/**
 * Session navigator: a progress track you can click/tap to jump, previous/next buttons and an empty number box.
 * Mobile puts the track on its own full-width row with 44px controls under it.
 */
export const StudyNav = forwardRef<HTMLInputElement, { cells: NavCell[]; index: number; onGo: (i: number) => void; disabled?: boolean; shortcuts?: boolean }>(
  ({ cells, index, onGo, disabled, shortcuts }, jumpRef) => {
    const [hover, setHover] = useState<number | null>(null);
    const [draft, setDraft] = useState('');
    const total = cells.length;
    const at = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      return Math.min(total - 1, Math.max(0, Math.floor(((e.clientX - r.left) / Math.max(1, r.width)) * total)));
    };
    const jump = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const n = Number(draft.trim());
      if (!Number.isInteger(n) || n < 1 || n > total) { toast.error(`1–${total} 사이의 번호를 입력하세요`); return; }
      setDraft('');
      (e.currentTarget.elements.namedItem('jump') as HTMLInputElement | null)?.blur();
      onGo(n - 1);
    };
    const pct = (i: number) => `${((i + 0.5) / Math.max(1, total)) * 100}%`;
    return (
      <nav aria-label="문제 이동" className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 md:flex-nowrap" data-testid="study-nav">
        <div
          className="relative order-first w-full cursor-pointer py-3 md:order-2 md:w-auto md:flex-1 md:py-2"
          aria-hidden
          data-testid="study-nav-track"
          onClick={(e) => { if (!disabled) onGo(at(e)); }}
          onPointerMove={(e) => { if (e.pointerType === 'mouse') setHover(at(e)); }}
          onPointerLeave={() => setHover(null)}
        >
          <div className={cn('flex h-2 w-full overflow-hidden rounded-full bg-sunken', total <= 60 && 'gap-px')}>
            {cells.map((c, i) => <span key={i} className={cn('h-full min-w-0 flex-1', cellClass(c))} data-status={c.status} />)}
          </div>
          <span className="pointer-events-none absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" style={{ left: pct(index) }} />
          {hover !== null && cells[hover] ? (
            <span className="pointer-events-none absolute bottom-full z-10 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[11px] text-bg tabular" style={{ left: pct(hover) }}>
              {describe(hover, cells[hover])}
            </span>
          ) : null}
        </div>
        <Button variant="ghost" size="iconSm" className="order-1 max-md:h-11 max-md:w-11" aria-label="이전 문제" disabled={disabled || index <= 0} onClick={() => onGo(index - 1)} data-testid="nav-prev">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <form onSubmit={jump} className="order-2 flex items-center gap-1 text-[13px] text-ink-3 max-md:mx-auto md:order-4">
          <input
            ref={jumpRef}
            name="jump"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(''); e.currentTarget.blur(); } }}
            inputMode="numeric"
            enterKeyHint="go"
            autoComplete="off"
            placeholder={String(index + 1)}
            aria-label={`이동할 문제 번호 (현재 ${index + 1}번, 전체 ${total}문제)`}
            disabled={disabled}
            className="h-8 w-14 rounded-md border border-line-strong bg-elevated px-2 text-center text-sm text-ink tabular placeholder:text-ink-2"
            data-testid="nav-jump"
          />
          <span className="tabular">/ {total}</span>
          {shortcuts ? <span className="ml-1 max-md:hidden" aria-hidden><kbd className="kbd">G</kbd></span> : null}
        </form>
        <Button variant="ghost" size="iconSm" className="order-3 max-md:h-11 max-md:w-11" aria-label="다음 문제" disabled={disabled || index >= total - 1} onClick={() => onGo(index + 1)} data-testid="nav-next">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </nav>
    );
  },
);
StudyNav.displayName = 'StudyNav';
