'use client';
import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { cn, seededShuffle } from '@/lib/utils';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'categorize' }>;

/** Assign each item to a category. Items and categories are shuffled per round; keys: 1-9 focus item, A-H pick category. */
export function Categorize({ question, value, onChange, onSubmit, phase, grade, answerKey, shuffleSeed, showKeyHints, readOnly, registerDigitHandler }: RendererProps<Q>) {
  const asg = value?.type === 'categorize' ? value.assignments : {};
  const revealed = phase !== 'answering';
  const items = useMemo(() => (shuffleSeed ? seededShuffle(question.items, `${question.id}:items:${shuffleSeed}`) : question.items), [question, shuffleSeed]);
  const cats = useMemo(() => (shuffleSeed ? seededShuffle(question.categories, `${question.id}:cats:${shuffleSeed}`) : question.categories), [question, shuffleSeed]);
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const key = new Map((((answerKey?.items as { id: string; categoryId: string }[] | undefined) ?? []).map((i) => [i.id, i.categoryId])));
  const label = (cid: string | null | undefined) => question.categories.find((c) => c.id === cid)?.label ?? '';
  const selects = useRef<(HTMLSelectElement | null)[]>([]);
  const letter = (i: number) => String.fromCharCode(65 + i);
  useEffect(() => { registerDigitHandler?.((n) => selects.current[n - 1]?.focus()); }, [registerDigitHandler]);
  const set = (id: string, cid: string) => onChange({ type: 'categorize', assignments: { ...asg, [id]: cid } });
  return (
    <div className={cn('grid gap-4', !revealed && 'md:grid-cols-[minmax(0,3fr)_minmax(12rem,1fr)]')}>
      <ul className="space-y-1.5" data-testid="categorize-items">
        {items.map((it, i) => {
          const p = parts.get(it.id);
          return (
            <li key={it.id} className={cn('grid items-center gap-2 rounded-md border px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,40%)]', revealed ? (p?.correct ? 'border-ok bg-ok-soft' : 'border-bad bg-bad-soft') : 'border-line bg-elevated')}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-muted text-[12px] font-semibold tabular text-ink-2">{showKeyHints ? i + 1 : ''}</span>
                <Markdown className="prose-sm min-w-0 flex-1">{it.text}</Markdown>
              </div>
              {!revealed ? (
                <select ref={(el) => { selects.current[i] = el; }} value={asg[it.id] ?? ''} disabled={readOnly} aria-label={`${it.text} 분류`} className="h-9 w-full min-w-0 truncate rounded-md border border-line-strong bg-elevated px-2 text-sm"
                  onChange={(e) => set(it.id, e.target.value)}
                  onKeyDown={(e) => { const k = e.key.toUpperCase(); const ci = k.charCodeAt(0) - 65; if (k.length === 1 && ci >= 0 && ci < cats.length) { e.preventDefault(); set(it.id, cats[ci]!.id); selects.current[i + 1]?.focus(); } if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } }}>
                  <option value="">— 범주 —</option>
                  {cats.map((c, j) => <option key={c.id} value={c.id}>{letter(j)}. {c.label}</option>)}
                </select>
              ) : (
                <div className="min-w-0 text-sm">
                  <div className={cn('flex items-start gap-1 font-medium', p?.correct ? 'text-ok-ink' : 'text-bad-ink')}>{p?.correct ? <Check className="mt-1 h-3.5 w-3.5 shrink-0" /> : <X className="mt-1 h-3.5 w-3.5 shrink-0" />}<span className="min-w-0">{label(asg[it.id]) || '미분류'}</span></div>
                  {!p?.correct ? <div className="text-[13px] text-ink-2">정답: {label(key.get(it.id))}</div> : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!revealed ? <ol className="space-y-1 rounded-md border border-line bg-muted/50 p-3 text-sm" aria-label="범주">{cats.map((c, j) => <li key={c.id}><span className="font-semibold tabular text-ink-2">{letter(j)}.</span> {c.label}</li>)}</ol> : null}
    </div>
  );
}
