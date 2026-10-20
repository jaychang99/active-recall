'use client';
import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { cn, seededShuffle } from '@/lib/utils';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'matrix' }>;

/** Row × column check grid. Rows are shuffled per round (their order carries no meaning), columns keep the authored
 *  order. `selection: single` renders one radio group per row. Digits focus a row; Space toggles the focused cell. */
export function Matrix({ question, value, onChange, onSubmit, phase, grade, answerKey, shuffleSeed, showKeyHints, readOnly, registerDigitHandler }: RendererProps<Q>) {
  const cells = value?.type === 'matrix' ? value.cells : [];
  const revealed = phase !== 'answering';
  const single = question.selection === 'single';
  const rows = useMemo(() => (shuffleSeed ? seededShuffle(question.rows, `${question.id}:${shuffleSeed}`) : question.rows), [question, shuffleSeed]);
  const has = (r: string, c: string) => cells.some((x) => x.rowId === r && x.columnId === c);
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const expected = new Set((((answerKey?.answer as { cells?: { rowId: string; columnId: string }[] } | undefined)?.cells ?? []).map((c) => `${c.rowId}:${c.columnId}`)));
  const firstInputs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { registerDigitHandler?.((n) => firstInputs.current[n - 1]?.focus()); }, [registerDigitHandler]);

  const toggle = (r: string, c: string) => {
    if (revealed || readOnly) return;
    let next = cells.filter((x) => !(x.rowId === r && x.columnId === c));
    if (single) next = next.filter((x) => x.rowId !== r);
    if (single || !has(r, c)) next = [...next, { rowId: r, columnId: c }];
    onChange({ type: 'matrix', cells: next });
  };

  return (
    <div className="space-y-2">
      {!revealed ? <p className="text-[12px] text-ink-3">{single ? '행마다 해당하는 열 하나를 고르세요.' : '해당하는 칸을 모두 표시하세요 (없는 행이 있을 수도 있습니다).'} Enter: 제출</p> : null}
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full border-collapse text-sm" data-testid="matrix-grid">
          <thead>
            <tr className="bg-muted/60">
              <th className="px-3 py-2 text-left font-medium text-ink-3" />
              {question.columns.map((c) => <th key={c.id} scope="col" className="px-2 py-2 text-center font-medium text-ink-2"><Markdown inline className="prose-sm">{c.text}</Markdown></th>)}
              {revealed ? <th className="px-2 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = parts.get(r.id);
              return (
                <tr key={r.id} className={cn('border-t border-line', revealed && (p?.correct ? 'bg-ok-soft/40' : 'bg-bad-soft/40'))}>
                  <th scope="row" className="px-3 py-2 text-left font-normal text-ink">
                    <span className="flex items-center gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-muted text-[12px] font-semibold tabular text-ink-2">{showKeyHints ? i + 1 : ''}</span>
                      <Markdown inline className="prose-sm">{r.text}</Markdown>
                    </span>
                  </th>
                  {question.columns.map((c, j) => {
                    const on = has(r.id, c.id);
                    const exp = expected.has(`${r.id}:${c.id}`);
                    const state = !revealed ? (on ? 'on' : 'off') : exp && on ? 'hit' : exp ? 'missed' : on ? 'wrong' : 'off';
                    return (
                      <td key={c.id} className="px-2 py-2 text-center">
                        <label className={cn('inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border', state === 'off' && 'border-line-strong bg-elevated', state === 'on' && 'border-accent bg-accent text-accent-ink', state === 'hit' && 'border-ok bg-ok text-accent-ink', state === 'missed' && 'border-dashed border-ok bg-ok-soft text-ok-ink', state === 'wrong' && 'border-bad bg-bad-soft text-bad-ink', (revealed || readOnly) && 'cursor-default')}>
                          <input ref={(el) => { if (j === 0) firstInputs.current[i] = el; }} type={single ? 'radio' : 'checkbox'} name={single ? `${question.id}-${r.id}` : undefined} className="sr-only" checked={on} disabled={revealed || readOnly}
                            aria-label={`${r.text} × ${c.text}`} data-cell={`${r.id}:${c.id}`}
                            onChange={() => toggle(r.id, c.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } if (e.key === ' ' && single) { e.preventDefault(); toggle(r.id, c.id); } }} />
                          {state === 'on' || state === 'hit' || state === 'missed' ? <Check className="h-4 w-4" strokeWidth={3} /> : state === 'wrong' ? <X className="h-4 w-4" strokeWidth={3} /> : null}
                        </label>
                      </td>
                    );
                  })}
                  {revealed ? <td className={cn('px-2 py-2 text-[12px] font-medium whitespace-nowrap', p?.correct ? 'text-ok-ink' : 'text-bad-ink')}>{p?.correct ? '행 정답' : '행 오답'}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {revealed ? <p className="text-[12px] text-ink-3">초록 = 정답 칸(점선: 놓침) · 빨강 = 잘못 표시 · 행 단위로 채점 · 부분 일치 {Math.round((grade?.detail.partialRatio ?? 0) * 100)}% (정답 인정 아님)</p> : null}
    </div>
  );
}
