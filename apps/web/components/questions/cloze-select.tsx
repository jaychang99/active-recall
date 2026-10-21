'use client';
import { focusAnswerInput } from '@/lib/answer-focus';
import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { cn, seededShuffle } from '@/lib/utils';
import type { ClozeRenderConfig } from './cloze-blanks';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'cloze_select' }>;

/** Cloze with a dropdown per blank. The prompt renders as one Markdown document (tables, lists and mermaid/svg
 *  drawings stay intact; blanks inside drawings show as ①②③ with the selects listed below). Option order is shuffled
 *  per round so position carries no information. */
export function ClozeSelect({ question, value, onChange, onSubmit, phase, grade, answerKey, shuffleSeed, readOnly }: RendererProps<Q>) {
  const chosen = value?.type === 'cloze_select' ? value.blanks : {};
  const revealed = phase !== 'answering';
  const options = useMemo(() => new Map(question.blanks.map((b) => [b.id, shuffleSeed ? seededShuffle(b.options, `${question.id}:${b.id}:${shuffleSeed}`) : b.options])), [question, shuffleSeed]);
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const key = new Map((((answerKey?.blanks as { id: string; answerOptionId: string }[] | undefined) ?? []).map((b) => [b.id, b.answerOptionId])));
  const root = useRef<HTMLDivElement>(null);
  const selectsInOrder = () => Array.from(root.current?.querySelectorAll<HTMLSelectElement>('select[data-blank-id]') ?? []);
  useEffect(() => { if (!revealed && !readOnly) focusAnswerInput(selectsInOrder()[0]); }, [revealed, readOnly, question.id]);
  const ids = useMemo(() => question.blanks.map((b) => b.id), [question.blanks]);
  const hasDiagram = /```\s*(mermaid|svg)\b/i.test(question.prompt);
  const optText = (bid: string, oid: string | null | undefined) => question.blanks.find((b) => b.id === bid)?.options.find((o) => o.id === oid)?.text ?? '';

  const renderBlank = (id: string) => {
      const n = ids.indexOf(id);
      const p = parts.get(id);
      return (
        <span className="mx-0.5 inline-flex items-center gap-1 align-baseline">
          {!revealed ? (
            <select value={chosen[id] ?? ''} disabled={readOnly} aria-label={`빈칸 ${n + 1}`} data-blank-id={id}
              className="h-8 max-w-full truncate rounded-md border border-line-strong bg-elevated px-2 text-[0.95rem]"
              onChange={(e) => onChange({ type: 'cloze_select', blanks: { ...chosen, [id]: e.target.value } })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const list = selectsInOrder();
                  const next = list[list.indexOf(e.currentTarget) + 1];
                  if (next && !chosen[next.dataset.blankId ?? '']) next.focus();
                  else onSubmit();
                }
              }}>
              <option value="">— 선택 —</option>
              {options.get(id)?.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
            </select>
          ) : (
            <span className={cn('rounded-md border px-2 py-0.5 text-[0.95rem]', p?.correct ? 'border-ok bg-ok-soft text-ok-ink' : 'border-bad bg-bad-soft text-bad-ink')}>
              {p?.correct ? <Check className="mr-1 inline h-3.5 w-3.5" /> : <X className="mr-1 inline h-3.5 w-3.5" />}
              <Markdown inline>{optText(id, chosen[id]) || '(미선택)'}</Markdown>
              {!p?.correct ? <span className="ml-1 text-[12px]">→ <Markdown inline>{optText(id, key.get(id))}</Markdown></span> : null}
            </span>
          )}
        </span>
      );
  };
  const cloze: ClozeRenderConfig = { ids, render: renderBlank };

  return (
    <div className="space-y-3">
      <div ref={root}>
        <Markdown className="text-[1.125rem] leading-[2.2]" cloze={cloze}>{question.prompt}</Markdown>
      </div>
      {!revealed ? <p className="text-[12px] text-ink-3">각 빈칸에서 보기를 고르세요. Enter: 다음 빈칸 / 제출{hasDiagram ? ' · 도식 안의 ①②③ 번호는 아래 선택칸에 해당' : ''}</p> : null}
    </div>
  );
}
