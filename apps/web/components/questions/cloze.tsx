'use client';
import { focusAnswerInput } from '@/lib/answer-focus';
import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { isComposing } from '@/lib/shortcuts/manager';
import { cn } from '@/lib/utils';
import { circledLabel, type ClozeRenderConfig } from './cloze-blanks';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'cloze' }>;

/** Fill-in-the-blank. The whole prompt renders as one Markdown document; each `{{id}}` (in a paragraph, a table
 *  cell, a list, or — as ①②③ labels — inside a mermaid/svg drawing) becomes a text input. Enter moves to the next
 *  empty blank in document order and submits from the last one. */
export function Cloze({ question, value, onChange, onSubmit, phase, grade, answerKey, readOnly }: RendererProps<Q>) {
  const blanks = value?.type === 'cloze' ? value.blanks : {};
  const revealed = phase !== 'answering';
  const root = useRef<HTMLDivElement>(null);
  const inputsInOrder = () => Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[data-blank-id]') ?? []);
  useEffect(() => {
    if (!revealed && !readOnly) focusAnswerInput(inputsInOrder()[0]);
  }, [revealed, readOnly, question.id]);
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const key = new Map((((answerKey?.blanks as { id: string; acceptedAnswers: string[] }[] | undefined) ?? []).map((b) => [b.id, b.acceptedAnswers])));
  const ids = useMemo(() => question.blanks.map((b) => b.id), [question.blanks]);
  const hasDiagram = /```\s*(mermaid|svg)\b/i.test(question.prompt);

  const renderBlank = (id: string) => {
      const n = ids.indexOf(id);
      const p = parts.get(id);
      const width = Math.max(6, (blanks[id]?.length ?? 0) + 2, ...(key.get(id)?.map((a) => a.length + 2) ?? []));
      return (
        <span className="mx-0.5 inline-flex max-w-full items-center align-baseline">
          <input
            value={blanks[id] ?? ''}
            disabled={revealed || readOnly}
            aria-label={`빈칸 ${n + 1}`}
            data-blank-id={id}
            autoComplete="off"
            style={{ width: `${width}ch` }}
            className={cn('h-8 min-w-0 max-w-full rounded-md border bg-elevated px-2 text-center text-[1rem] outline-none focus-visible:border-accent', revealed ? (p?.correct ? 'border-ok bg-ok-soft text-ok-ink' : 'border-bad bg-bad-soft text-bad-ink') : 'border-line-strong')}
            onChange={(e) => onChange({ type: 'cloze', blanks: { ...blanks, [id]: e.target.value } })}
            onKeyDown={(e) => {
              if (isComposing(e.nativeEvent)) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                const list = inputsInOrder();
                const next = list[list.indexOf(e.currentTarget) + 1];
                if (next && !(blanks[next.dataset.blankId ?? ''] ?? '').length) next.focus();
                else onSubmit();
              }
            }}
          />
          {revealed ? (
            <span className={cn('ml-1 inline-flex items-center gap-0.5 text-[12px] font-medium', p?.correct ? 'text-ok-ink' : 'text-bad-ink')}>
              {p?.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {!p?.correct ? <span>정답: <Markdown inline>{key.get(id)?.[0] ?? ''}</Markdown></span> : null}
            </span>
          ) : null}
        </span>
      );
  };
  const cloze: ClozeRenderConfig = { ids, render: renderBlank };

  return (
    <div className="space-y-3">
      <div ref={root}>
        <Markdown className="text-[1.125rem] leading-[2.1]" cloze={cloze}>{question.prompt}</Markdown>
      </div>
      {!revealed ? (
        <p className="text-[12px] text-ink-3">
          Enter: 다음 빈칸으로 이동, 마지막 빈칸에서 Enter: 제출 · Tab으로도 이동{hasDiagram ? ' · 도식 안의 ①②③ 번호는 아래 입력칸에 해당' : ''}
        </p>
      ) : null}
      {revealed ? (
        <div className="text-[13px] text-ink-2">
          {[...key.entries()].map(([id, acc]) => (
            <div key={id}>
              빈칸 <code className="rounded bg-muted px-1">{id}</code>
              {hasDiagram ? <span className="ml-1 text-ink-3">{circledLabel(ids.indexOf(id))}</span> : null} 인정 답안: {acc.join(' / ')}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
