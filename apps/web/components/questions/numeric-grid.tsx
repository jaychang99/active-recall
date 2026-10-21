'use client';
import { focusAnswerInput } from '@/lib/answer-focus';
import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { isComposing } from '@/lib/shortcuts/manager';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'numeric_grid' }>;

/** Table of numeric answers. Only cells listed in `cells` take input; `given` cells are shown as text; the rest stay
 *  empty. Row/column order is content, never shuffled. Enter moves to the next empty cell, then submits. */
export function NumericGrid({ question, value, onChange, onSubmit, phase, grade, answerKey, readOnly }: RendererProps<Q>) {
  const values = value?.type === 'numeric_grid' ? value.values : {};
  const revealed = phase !== 'answering';
  const root = useRef<HTMLDivElement>(null);
  const inputsInOrder = () => Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[data-cell-id]') ?? []);
  useEffect(() => { if (!revealed && !readOnly) focusAnswerInput(inputsInOrder()[0]); }, [revealed, readOnly, question.id]);
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const key = new Map((((answerKey?.cells as { id: string; value: number; tolerance?: number; relativeTolerance?: number }[] | undefined) ?? []).map((c) => [c.id, c])));
  const cellAt = (r: string, c: string) => question.cells.find((x) => x.rowId === r && x.columnId === c);
  const givenAt = (r: string, c: string) => question.given?.find((x) => x.rowId === r && x.columnId === c);
  // Raw text per cell so intermediate input like "-" or "1." survives the number round-trip.
  const [raw, setRawState] = useState<Record<string, string>>({});
  useEffect(() => { setRawState({}); }, [question.id]);
  const setRaw = (id: string, s: string) => setRawState((r) => ({ ...r, [id]: s }));

  return (
    <div className="space-y-2" ref={root}>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="border-collapse text-sm" data-testid="numeric-grid">
          <thead>
            <tr className="bg-muted/60">
              <th className="px-3 py-2" />
              {question.columns.map((c) => <th key={c.id} scope="col" className="px-2 py-2 text-center font-medium text-ink-2"><Markdown inline className="prose-sm">{c.label}</Markdown></th>)}
            </tr>
          </thead>
          <tbody>
            {question.rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left font-medium text-ink-2"><Markdown inline className="prose-sm">{r.label}</Markdown></th>
                {question.columns.map((c) => {
                  const cell = cellAt(r.id, c.id);
                  const g = givenAt(r.id, c.id);
                  if (!cell) return <td key={c.id} className="px-2 py-2 text-center tabular text-ink">{g ? <Markdown inline className="prose-sm">{g.text}</Markdown> : <span className="text-ink-3">—</span>}</td>;
                  const p = parts.get(cell.id);
                  const v = values[cell.id];
                  const k = key.get(cell.id);
                  return (
                    <td key={c.id} className="px-2 py-1.5 text-center">
                      <input type="text" inputMode="decimal" autoComplete="off" data-cell-id={cell.id} aria-label={`${r.label} ${c.label}`}
                        value={raw[cell.id] ?? (v === null || v === undefined ? '' : String(v))}
                        disabled={revealed || readOnly}
                        className={cn('h-9 w-24 rounded-md border bg-elevated px-2 text-center text-[15px] tabular outline-none focus-visible:border-accent', revealed ? (p?.correct ? 'border-ok bg-ok-soft text-ok-ink' : 'border-bad bg-bad-soft text-bad-ink') : 'border-line-strong')}
                        onChange={(e) => { setRaw(cell.id, e.target.value); const n = Number(e.target.value.replace(/,/g, '')); onChange({ type: 'numeric_grid', values: { ...values, [cell.id]: e.target.value.trim() === '' || Number.isNaN(n) ? null : n } }); }}
                        onKeyDown={(e) => {
                          if (isComposing(e.nativeEvent)) return;
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const list = inputsInOrder();
                            const next = list[list.indexOf(e.currentTarget) + 1];
                            if (next && (values[next.dataset.cellId ?? ''] === null || values[next.dataset.cellId ?? ''] === undefined)) next.focus();
                            else onSubmit();
                          }
                        }} />
                      {revealed && !p?.correct && k ? <div className="mt-0.5 text-[12px] text-ok-ink tabular">정답 {k.value}{k.tolerance ? ` ±${k.tolerance}` : ''}{k.relativeTolerance ? ` ±${k.relativeTolerance * 100}%` : ''}</div> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {question.unit ? <p className="text-[12px] text-ink-3">단위: {question.unit}</p> : null}
      {!revealed ? <p className="text-[12px] text-ink-3">각 칸에 숫자를 입력하세요. Enter: 다음 칸 / 마지막 칸에서 제출</p> : null}
      {revealed ? (
        <p className={cn('flex items-center gap-1 text-[13px] font-medium', grade?.isCorrect ? 'text-ok-ink' : 'text-bad-ink')}>
          {grade?.isCorrect ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {grade?.isCorrect ? '모든 칸 정답' : `${(grade?.detail.parts ?? []).filter((x) => x.correct).length}/${question.cells.length} 칸 정답`}
        </p>
      ) : null}
    </div>
  );
}
