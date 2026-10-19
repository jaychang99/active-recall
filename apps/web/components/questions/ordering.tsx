'use client';
import { ArrowDown, ArrowUp, Check, GripVertical, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { cn, seededShuffle } from '@/lib/utils';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'ordering' }>;

export function Ordering({ question, value, onChange, phase, grade, answerKey, shuffleSeed, readOnly, registerDigitHandler }: RendererProps<Q>) {
  const initial = useMemo(() => seededShuffle(question.items.map((i) => i.id), `${question.id}:${shuffleSeed ?? 'fixed'}`), [question, shuffleSeed]);
  const order = value?.type === 'ordering' && value.orderedIds.length === question.items.length ? value.orderedIds : initial;
  const revealed = phase !== 'answering';
  const disabled = revealed || !!readOnly;
  const [focusIdx, setFocusIdx] = useState(0);
  const [dragging, setDragging] = useState<string | null>(null);
  const byId = new Map(question.items.map((i) => [i.id, i]));
  const expected = ((answerKey?.answer as { orderedIds?: string[] } | undefined)?.orderedIds ?? []) as string[];
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (value?.type !== 'ordering' || value.orderedIds.length !== question.items.length) onChange({ type: 'ordering', orderedIds: initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  const move = (from: number, to: number) => {
    if (disabled || to < 0 || to >= order.length) return;
    const next = [...order];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it!);
    onChange({ type: 'ordering', orderedIds: next });
    setFocusIdx(to);
    requestAnimationFrame(() => buttons.current[to]?.focus());
  };
  useEffect(() => {
    // digit keys: 1-9 select the row to move; use J/K via buttons otherwise
    registerDigitHandler?.((n) => {
      if (n - 1 < order.length) {
        setFocusIdx(n - 1);
        buttons.current[n - 1]?.focus();
      }
    });
  }, [order.length, registerDigitHandler]);

  return (
    <div className="space-y-2">
      {!revealed ? <p className="text-[12px] text-ink-3">항목을 올바른 순서로 배열하세요. 항목 선택 후 <kbd className="kbd">↑</kbd>/<kbd className="kbd">↓</kbd> 또는 버튼으로 이동 · 드래그도 가능</p> : null}
      <ol className="space-y-1.5" data-testid="ordering-list">
        {order.map((id, i) => {
          const item = byId.get(id);
          const correct = revealed ? expected[i] === id : null;
          return (
            <li
              key={id}
              draggable={!disabled}
              onDragStart={() => setDragging(id)}
              onDragOver={(e) => { if (dragging) e.preventDefault(); }}
              onDrop={() => { if (dragging) { move(order.indexOf(dragging), i); setDragging(null); } }}
              className={cn('flex items-center gap-2 rounded-md border px-2 py-2', revealed ? (correct ? 'border-ok bg-ok-soft' : 'border-bad bg-bad-soft') : i === focusIdx ? 'border-accent bg-accent-soft/40' : 'border-line bg-elevated')}
            >
              <button
                ref={(el) => { buttons.current[i] = el; }}
                type="button"
                disabled={disabled}
                aria-label={`${i + 1}번 항목: ${item?.text ?? id}`}
                onFocus={() => setFocusIdx(i)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1); }
                }}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <GripVertical className="h-4 w-4 shrink-0 text-ink-3" />
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-muted text-[12px] font-semibold tabular text-ink-2">{i + 1}</span>
                <Markdown className="prose-sm min-w-0 flex-1">{item?.text ?? id}</Markdown>
              </button>
              {!revealed ? (
                <span className="flex shrink-0 gap-1">
                  <button type="button" disabled={disabled || i === 0} aria-label="위로" onClick={() => move(i, i - 1)} className="rounded border border-line p-1 text-ink-2 hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" disabled={disabled || i === order.length - 1} aria-label="아래로" onClick={() => move(i, i + 1)} className="rounded border border-line p-1 text-ink-2 hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                </span>
              ) : (
                <span className={cn('flex shrink-0 items-center gap-1 text-[12px] font-medium', correct ? 'text-ok-ink' : 'text-bad-ink')}>
                  {correct ? <><Check className="h-3.5 w-3.5" /> 위치 정답</> : <><X className="h-3.5 w-3.5" /> 정답 위치 {expected.indexOf(id) + 1}</>}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {revealed && grade ? <div className="text-[15px] text-ink"><span className="font-semibold">정확한 순서</span> · {expected.map((id, i) => <span key={id} className="mr-1">{i + 1}. <Markdown inline className="prose-sm">{byId.get(id)?.text ?? id}</Markdown>{i < expected.length - 1 ? ' →' : ''}</span>)}</div> : null}
    </div>
  );
}
