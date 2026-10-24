'use client';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { cn, seededShuffle } from '@/lib/utils';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'parsons' }>;
type Line = { id: string; indent: number };

const INDENT_REM = 1.5;

/** Parsons problem: move code blocks from the pool into the solution, order them and set indentation. The pool is
 *  scrambled with the question/round seed (like `ordering`). Keys inside the solution: ↑/↓ move, ←/→ indent,
 *  Backspace returns to the pool; Enter/→ in the pool appends the block. Drag and drop works too. */
export function Parsons({ question, value, onChange, phase, grade, answerKey, shuffleSeed, readOnly, registerDigitHandler }: RendererProps<Q>) {
  const lines: Line[] = value?.type === 'parsons' ? value.lines : [];
  const revealed = phase !== 'answering';
  const disabled = revealed || !!readOnly;
  const byId = new Map(question.blocks.map((b) => [b.id, b]));
  const poolOrder = useMemo(() => seededShuffle(question.blocks.map((b) => b.id), `${question.id}:${shuffleSeed ?? 'fixed'}`), [question, shuffleSeed]);
  const inSolution = new Set(lines.map((l) => l.id));
  const pool = poolOrder.filter((id) => !inSolution.has(id));
  const expected = ((answerKey?.answer as { lines?: Line[] } | undefined)?.lines ?? []) as Line[];
  const distractorIds = new Set(((answerKey?.distractorIds as string[] | undefined) ?? []));
  const checkIndent = question.checkIndent !== false;
  const parts = grade?.detail.parts ?? [];
  const [dragging, setDragging] = useState<string | null>(null);
  const solButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const poolButtons = useRef<(HTMLButtonElement | null)[]>([]);

  const set = (next: Line[]) => { if (!disabled) onChange({ type: 'parsons', lines: next }); };
  const add = (id: string, at = lines.length) => { const next = [...lines]; next.splice(at, 0, { id, indent: 0 }); set(next); requestAnimationFrame(() => solButtons.current[at]?.focus()); };
  const remove = (i: number) => { set(lines.filter((_, k) => k !== i)); requestAnimationFrame(() => poolButtons.current[0]?.focus()); };
  const move = (from: number, to: number) => { if (to < 0 || to >= lines.length) return; const next = [...lines]; const [it] = next.splice(from, 1); next.splice(to, 0, it!); set(next); requestAnimationFrame(() => solButtons.current[to]?.focus()); };
  const indent = (i: number, d: number) => set(lines.map((l, k) => (k === i ? { ...l, indent: Math.max(0, Math.min(10, l.indent + d)) } : l)));
  useEffect(() => { registerDigitHandler?.((n) => { const id = pool[n - 1]; if (id) add(id); }); });

  const code = (id: string) => <code className="whitespace-pre font-mono text-[13px]">{byId.get(id)?.code ?? id}</code>;

  return (
    <div className="space-y-2" data-testid="parsons">
      {!revealed ? <p className="text-[12px] text-ink-3">왼쪽 블록을 오른쪽 풀이로 옮겨 순서를 맞추고{checkIndent ? ' ←/→로 들여쓰기를 맞추세요' : ''}. 쓰이지 않는 블록이 있을 수 있습니다. 숫자키: n번째 블록 추가 · Backspace: 풀로 되돌림 · 드래그 가능</p> : null}
      <div className={cn('grid gap-3', !revealed && 'md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
        {!revealed ? (
          <ul className="min-h-24 space-y-1 rounded-md border border-dashed border-line bg-muted/40 p-2" aria-label="블록 풀" data-testid="parsons-pool" data-arrow-keys
            onDragOver={(e) => { if (dragging && inSolution.has(dragging)) e.preventDefault(); }}
            onDrop={() => { if (dragging) { const i = lines.findIndex((l) => l.id === dragging); if (i >= 0) remove(i); setDragging(null); } }}>
            {pool.map((id, i) => (
              <li key={id} draggable={!disabled} onDragStart={() => setDragging(id)} onDragEnd={() => setDragging(null)}>
                <button ref={(el) => { poolButtons.current[i] = el; }} type="button" disabled={disabled} data-block-id={id} aria-label={`블록 추가: ${byId.get(id)?.code ?? id}`}
                  onClick={() => add(id)} onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); add(id); } }}
                  className="flex w-full items-center gap-2 rounded-md border border-line bg-elevated px-2 py-1.5 text-left hover:border-accent">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-muted text-[11px] font-semibold tabular text-ink-2">{i + 1}</span>
                  {code(id)}
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-ink-3" />
                </button>
              </li>
            ))}
            {pool.length === 0 ? <li className="px-2 py-3 text-center text-[12px] text-ink-3">모든 블록을 사용했습니다</li> : null}
          </ul>
        ) : null}
        <ol className="min-h-24 space-y-1 rounded-md border border-line bg-sunken p-2" aria-label="풀이" data-testid="parsons-solution" data-arrow-keys
          onDragOver={(e) => { if (dragging) e.preventDefault(); }}
          onDrop={() => { if (dragging && !inSolution.has(dragging)) { add(dragging); setDragging(null); } }}>
          {lines.map((l, i) => {
            const p = parts[i];
            const exp = expected[i];
            const state = !revealed ? 'idle' : p?.correct ? 'ok' : 'bad';
            return (
              <li key={l.id} draggable={!disabled} onDragStart={() => setDragging(l.id)} onDragEnd={() => setDragging(null)}
                onDragOver={(e) => { if (dragging) { e.preventDefault(); e.stopPropagation(); } }}
                onDrop={(e) => { e.stopPropagation(); if (!dragging) return; const from = lines.findIndex((x) => x.id === dragging); if (from >= 0) move(from, i); else add(dragging, i); setDragging(null); }}
                className={cn('flex items-center gap-1 rounded-md border px-1.5 py-1', state === 'idle' && 'border-line bg-elevated', state === 'ok' && 'border-ok bg-ok-soft', state === 'bad' && 'border-bad bg-bad-soft')}>
                <button ref={(el) => { solButtons.current[i] = el; }} type="button" disabled={disabled} data-line-id={l.id} aria-label={`${i + 1}번째 줄: ${byId.get(l.id)?.code ?? l.id}, 들여쓰기 ${l.indent}`}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1); }
                    if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1); }
                    if (e.key === 'ArrowLeft') { e.preventDefault(); indent(i, -1); }
                    if (e.key === 'ArrowRight') { e.preventDefault(); indent(i, 1); }
                    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); remove(i); }
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded text-left outline-none focus-visible:ring-1 focus-visible:ring-accent">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-muted text-[11px] font-semibold tabular text-ink-2">{i + 1}</span>
                  <span className="flex min-w-0 items-center" style={{ paddingLeft: `${l.indent * INDENT_REM}rem` }}>
                    {Array.from({ length: l.indent }, (_, k) => <span key={k} className="absolute h-5 border-l border-line-strong" style={{ marginLeft: `-${(l.indent - k) * INDENT_REM - 0.2}rem` }} aria-hidden />)}
                    {code(l.id)}
                  </span>
                </button>
                {!revealed ? (
                  <span className="flex shrink-0 gap-0.5">
                    {checkIndent ? <><IconBtn label="내어쓰기" disabled={disabled || l.indent === 0} onClick={() => indent(i, -1)}><ArrowLeft className="h-3.5 w-3.5" /></IconBtn><IconBtn label="들여쓰기" disabled={disabled || l.indent >= 10} onClick={() => indent(i, 1)}><ArrowRight className="h-3.5 w-3.5" /></IconBtn></> : null}
                    <IconBtn label="위로" disabled={disabled || i === 0} onClick={() => move(i, i - 1)}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn label="아래로" disabled={disabled || i === lines.length - 1} onClick={() => move(i, i + 1)}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn label="풀로 되돌리기" disabled={disabled} onClick={() => remove(i)}><ChevronLeft className="h-3.5 w-3.5" /></IconBtn>
                  </span>
                ) : (
                  <span className={cn('flex shrink-0 items-center gap-1 text-[12px] font-medium', state === 'ok' ? 'text-ok-ink' : 'text-bad-ink')}>
                    {state === 'ok' ? <><Check className="h-3.5 w-3.5" /> 정답</> : <><X className="h-3.5 w-3.5" /> {distractorIds.has(l.id) ? '불필요한 줄' : exp && exp.id === l.id ? `들여쓰기 ${exp.indent}` : exp ? `여기엔 ${(expected.findIndex((x) => x.id === l.id) + 1) || '—'}번 줄` : '초과'}</>}
                  </span>
                )}
              </li>
            );
          })}
          {lines.length === 0 ? <li className="px-2 py-3 text-center text-[12px] text-ink-3">여기에 블록을 놓으세요</li> : null}
        </ol>
      </div>
      {revealed ? (
        <div className="rounded-md border border-line bg-muted/60 p-3">
          <div className="mb-1 text-[12px] font-semibold text-ink-3">정답 코드{grade?.detail.note ? <span className="font-normal"> · {grade.detail.note}</span> : null}</div>
          <pre className="m-0 bg-transparent p-0 font-mono text-[13px] leading-[1.8] text-ink">{expected.map((l) => `${' '.repeat(l.indent * 4)}${byId.get(l.id)?.code ?? l.id}`).join('\n')}</pre>
        </div>
      ) : null}
    </div>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} aria-label={label} title={label} onClick={onClick} className="rounded border border-line p-1 text-ink-2 hover:bg-muted disabled:opacity-30">{children}</button>;
}
