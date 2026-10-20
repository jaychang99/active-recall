'use client';
import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<K extends string> { key: K; label: React.ReactNode; hint?: string; badge?: React.ReactNode }

/**
 * Controlled tab strip (WAI-ARIA tabs, arrow keys move focus + selection).
 * Render the panel yourself with `tabPanelProps(key)` so each tab's content can be any component.
 */
export function Tabs<K extends string>({ items, value, onChange, className, idPrefix }: { items: TabItem<K>[]; value: K; onChange: (k: K) => void; className?: string; idPrefix?: string }) {
  const autoId = useId();
  const base = idPrefix ?? autoId;
  const move = (dir: 1 | -1) => {
    const i = items.findIndex((t) => t.key === value);
    const next = items[(i + dir + items.length) % items.length];
    if (!next) return;
    onChange(next.key);
    document.getElementById(`${base}-tab-${next.key}`)?.focus();
  };
  return (
    <div role="tablist" aria-orientation="horizontal" className={cn('flex gap-1 border-b border-line', className)}>
      {items.map((t) => {
        const selected = t.key === value;
        return (
          <button
            key={t.key}
            id={`${base}-tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${base}-panel-${t.key}`}
            tabIndex={selected ? 0 : -1}
            title={t.hint}
            data-testid={`tab-${t.key}`}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); move(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); } }}
            className={cn('-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors', selected ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink-2')}
          >
            {t.label}
            {t.badge}
          </button>
        );
      })}
    </div>
  );
}

export function tabPanelProps(base: string, key: string) {
  return { id: `${base}-panel-${key}`, role: 'tabpanel' as const, 'aria-labelledby': `${base}-tab-${key}` };
}
