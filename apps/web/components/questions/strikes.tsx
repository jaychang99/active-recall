'use client';
import { Strikethrough } from 'lucide-react';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import type { Phase } from './types';

/**
 * Elimination marks ("이건 답이 아님"): a view-only strike-through the learner puts on options they have ruled out.
 * Never part of the answer payload, never sent to the API. Marks live in memory per page + question + shuffle seed,
 * so they survive moving between cards (study ←/→, exam navigation) but not a reload, and they are dropped as soon
 * as the card is answered or revealed (a later attempt starts clean).
 */
const store = new Map<string, ReadonlySet<string>>();
const listeners = new Set<() => void>();
const EMPTY: ReadonlySet<string> = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

function scopeKey(questionId: string, shuffleSeed: string | null) {
  const page = typeof window === 'undefined' ? '' : window.location.pathname;
  return `${page}|${questionId}|${shuffleSeed ?? ''}`;
}

export interface Strikes {
  /** Marking is possible (answering, not read-only). When false `struck` is always empty. */
  enabled: boolean;
  struck: ReadonlySet<string>;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Remove a mark (choosing an option un-strikes it). */
  unstrike: (id: string) => void;
  clear: () => void;
}

export function useStrikes(questionId: string, shuffleSeed: string | null, phase: Phase, readOnly?: boolean): Strikes {
  const enabled = phase === 'answering' && !readOnly;
  const key = scopeKey(questionId, shuffleSeed);
  const current = useSyncExternalStore(subscribe, () => store.get(key) ?? EMPTY, () => EMPTY);
  const struck = enabled ? current : EMPTY;
  // Answered or revealed (in the live renderer, not a read-only replay) → the marks have done their job.
  useEffect(() => {
    if (phase !== 'answering' && !readOnly && store.delete(key)) emit();
  }, [key, phase, readOnly]);
  const write = useCallback((id: string, on: boolean | null) => {
    const prev = store.get(key) ?? EMPTY;
    const next = new Set(prev);
    const want = on ?? !prev.has(id);
    if (want === prev.has(id)) return;
    if (want) next.add(id); else next.delete(id);
    if (next.size) store.set(key, next); else store.delete(key);
    emit();
  }, [key]);
  const toggle = useCallback((id: string) => { if (enabled) write(id, null); }, [enabled, write]);
  const unstrike = useCallback((id: string) => write(id, false), [write]);
  const has = useCallback((id: string) => struck.has(id), [struck]);
  const clear = useCallback(() => { if (store.delete(key)) emit(); }, [key]);
  return { enabled, struck, has, toggle, unstrike, clear };
}

/** A view of `s` whose ids are prefixed, for renderers with two option lists whose ids may collide (two_tier). */
export function prefixStrikes(s: Strikes, prefix: string): Strikes {
  const k = (id: string) => `${prefix}:${id}`;
  return { ...s, has: (id) => s.has(k(id)), toggle: (id) => s.toggle(k(id)), unstrike: (id) => s.unstrike(k(id)) };
}

/** Test helper: forget every mark. */
export function resetStrikesForTest() { store.clear(); emit(); }

/** Styling for struck content: dimmed text with a strike-through that stays legible. */
export const STRUCK_TEXT = 'text-ink-3 line-through decoration-ink-3 decoration-[1.5px] opacity-60';

/** The per-option toggle. Faint until the row is hovered/focused on pointer devices, always visible on touch. */
export function StrikeButton({ struck, onToggle, label, className }: { struck: boolean; onToggle: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={struck}
      aria-label={struck ? `${label} 지운 표시 해제` : `${label} 답 아님으로 지우기`}
      title={struck ? '지운 표시 해제' : '답이 아닌 보기로 지우기 (보기에서 우클릭해도 됨)'}
      data-strike-toggle
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={cn(
        'grid h-7 w-7 shrink-0 place-items-center rounded-md border transition-[opacity,colors] focus-visible:opacity-100',
        struck ? 'border-line-strong bg-muted text-ink opacity-100' : 'border-transparent text-ink-3 opacity-40 hover:border-line hover:bg-muted hover:text-ink-2 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
        className,
      )}
    >
      <Strikethrough className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * For passages and grids, where a per-item button would crowd the content: a mode switch. While it is on, a click
 * marks/unmarks instead of selecting.
 */
export function StrikeModeToggle({ on, onChange, count, onClear }: { on: boolean; onChange: (on: boolean) => void; count: number; onClear: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <button
        type="button"
        aria-pressed={on}
        data-testid="strike-mode"
        onClick={() => onChange(!on)}
        className={cn('inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-medium transition-colors', on ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-line text-ink-2 hover:border-line-strong hover:bg-muted')}
      >
        <Strikethrough className="h-3.5 w-3.5" />
        {on ? '지우기 모드 켜짐 — 클릭하면 지움' : '지우기 모드'}
      </button>
      {count > 0 ? (
        <button type="button" onClick={onClear} className="text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline">지운 표시 {count}개 모두 해제</button>
      ) : null}
    </div>
  );
}
