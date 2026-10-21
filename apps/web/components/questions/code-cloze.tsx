'use client';
import { focusAnswerInput } from '@/lib/answer-focus';
import { Check, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { splitCloze, type PublicQuestion } from '@recall/contracts';
import { isComposing } from '@/lib/shortcuts/manager';
import { cn } from '@/lib/utils';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'code_cloze' }>;

/** Blanks inside a code block. The code is shown verbatim in a monospace block (no Markdown, so `{{id}}` inside code
 *  is ours to replace) with an inline input per placeholder. Enter moves to the next empty blank, then submits. */
export function CodeCloze({ question, value, onChange, onSubmit, phase, grade, answerKey, readOnly }: RendererProps<Q>) {
  const blanks = value?.type === 'code_cloze' ? value.blanks : {};
  const revealed = phase !== 'answering';
  const root = useRef<HTMLDivElement>(null);
  const inputsInOrder = () => Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[data-blank-id]') ?? []);
  useEffect(() => { if (!revealed && !readOnly) focusAnswerInput(inputsInOrder()[0]); }, [revealed, readOnly, question.id]);
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const key = new Map((((answerKey?.blanks as { id: string; acceptedAnswers: string[] }[] | undefined) ?? []).map((b) => [b.id, b.acceptedAnswers])));
  const ids = question.blanks.map((b) => b.id);
  const lines = question.code.replace(/\r\n?/g, '\n').split('\n');

  const renderBlank = (id: string) => {
    const n = ids.indexOf(id);
    const p = parts.get(id);
    const width = Math.max(4, (blanks[id]?.length ?? 0) + 1, ...(key.get(id)?.map((a) => a.length + 1) ?? []));
    return (
      <span key={`${id}-blank`} className="mx-0.5 inline-flex items-center align-baseline">
        <input value={blanks[id] ?? ''} disabled={revealed || readOnly} aria-label={`빈칸 ${n + 1}`} data-blank-id={id} autoComplete="off" spellCheck={false}
          style={{ width: `${width}ch` }}
          className={cn('h-7 rounded border bg-elevated px-1.5 font-mono text-[13px] text-ink outline-none focus-visible:border-accent', revealed ? (p?.correct ? 'border-ok bg-ok-soft text-ok-ink' : 'border-bad bg-bad-soft text-bad-ink') : 'border-line-strong')}
          onChange={(e) => onChange({ type: 'code_cloze', blanks: { ...blanks, [id]: e.target.value } })}
          onKeyDown={(e) => {
            if (isComposing(e.nativeEvent)) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              const list = inputsInOrder();
              const next = list[list.indexOf(e.currentTarget) + 1];
              if (next && !(blanks[next.dataset.blankId ?? ''] ?? '').length) next.focus();
              else onSubmit();
            }
          }} />
        {revealed && !p?.correct ? <span className="ml-1 font-mono text-[12px] text-ok-ink">→ {key.get(id)?.[0] ?? ''}</span> : null}
      </span>
    );
  };

  return (
    <div className="space-y-2" ref={root}>
      <div className="relative overflow-x-auto rounded-md border border-line bg-sunken" data-testid="code-cloze">
        <span className="absolute right-2 top-1.5 text-[11px] uppercase text-ink-3">{question.language}</span>
        <pre className="m-0 bg-transparent p-3 pt-6 font-mono text-[13px] leading-[1.9] text-ink">
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre">
              <span className="mr-3 inline-block w-6 select-none text-right text-ink-3">{i + 1}</span>
              {splitCloze(line).map((seg, j) => (seg.kind === 'text' ? <span key={j}>{seg.text}</span> : renderBlank(seg.id)))}
            </div>
          ))}
        </pre>
      </div>
      {!revealed ? <p className="text-[12px] text-ink-3">코드는 대소문자를 구분합니다. Enter: 다음 빈칸 / 마지막에서 제출</p> : null}
      {revealed ? (
        <div className="text-[13px] text-ink-2">
          {[...key.entries()].map(([id, acc]) => {
            const p = parts.get(id);
            return (
              <div key={id} className="flex items-center gap-1">
                {p?.correct ? <Check className="h-3.5 w-3.5 text-ok" /> : <X className="h-3.5 w-3.5 text-bad" />}
                빈칸 <code className="rounded bg-muted px-1">{id}</code> 인정 답안: <code className="font-mono">{acc.join(' / ')}</code>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
