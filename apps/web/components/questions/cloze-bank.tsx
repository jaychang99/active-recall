'use client';
import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { cn, seededShuffle } from '@/lib/utils';
import type { ClozeRenderConfig } from './cloze-blanks';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'cloze_bank' }>;

/** Cloze filled from one shared word bank: every blank is a select over the same bank (shuffled per round); an item
 *  can sit in only one blank at a time, so choosing it elsewhere moves it. Extra bank items are distractors. */
export function ClozeBank({ question, value, onChange, onSubmit, phase, grade, answerKey, shuffleSeed, readOnly }: RendererProps<Q>) {
  const chosen = value?.type === 'cloze_bank' ? value.blanks : {};
  const revealed = phase !== 'answering';
  const bank = useMemo(() => (shuffleSeed ? seededShuffle(question.bank, `${question.id}:${shuffleSeed}`) : question.bank), [question, shuffleSeed]);
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const key = new Map((((answerKey?.blanks as { id: string; bankItemId: string }[] | undefined) ?? []).map((b) => [b.id, b.bankItemId])));
  const ids = useMemo(() => question.blanks.map((b) => b.id), [question.blanks]);
  const root = useRef<HTMLDivElement>(null);
  const selectsInOrder = () => Array.from(root.current?.querySelectorAll<HTMLSelectElement>('select[data-blank-id]') ?? []);
  useEffect(() => { if (!revealed && !readOnly) selectsInOrder()[0]?.focus(); }, [revealed, readOnly, question.id]);
  const text = (itemId: string | null | undefined) => question.bank.find((b) => b.id === itemId)?.text ?? '';
  const usedBy = (itemId: string) => Object.entries(chosen).find(([, v]) => v === itemId)?.[0];

  const set = (blankId: string, itemId: string) => {
    const next: Record<string, string> = { ...chosen };
    if (itemId) for (const [k, v] of Object.entries(next)) if (v === itemId && k !== blankId) delete next[k];
    if (itemId) next[blankId] = itemId; else delete next[blankId];
    onChange({ type: 'cloze_bank', blanks: next });
  };

  const renderBlank = (id: string) => {
    const n = ids.indexOf(id);
    const p = parts.get(id);
    return (
      <span className="mx-0.5 inline-flex items-center gap-1 align-baseline">
        {!revealed ? (
          <select value={chosen[id] ?? ''} disabled={readOnly} aria-label={`빈칸 ${n + 1}`} data-blank-id={id}
            className="h-8 max-w-full truncate rounded-md border border-line-strong bg-elevated px-2 text-[0.95rem]"
            onChange={(e) => set(id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const list = selectsInOrder();
                const next = list[list.indexOf(e.currentTarget) + 1];
                if (next && !chosen[next.dataset.blankId ?? '']) next.focus();
                else onSubmit();
              }
            }}>
            <option value="">— 보기 —</option>
            {bank.map((b) => { const u = usedBy(b.id); return <option key={b.id} value={b.id}>{b.text}{u && u !== id ? ` (빈칸 ${ids.indexOf(u) + 1}에 사용)` : ''}</option>; })}
          </select>
        ) : (
          <span className={cn('rounded-md border px-2 py-0.5 text-[0.95rem]', p?.correct ? 'border-ok bg-ok-soft text-ok-ink' : 'border-bad bg-bad-soft text-bad-ink')}>
            {p?.correct ? <Check className="mr-1 inline h-3.5 w-3.5" /> : <X className="mr-1 inline h-3.5 w-3.5" />}
            <Markdown inline>{text(chosen[id]) || '(미선택)'}</Markdown>
            {!p?.correct ? <span className="ml-1 text-[12px]">→ <Markdown inline>{text(key.get(id))}</Markdown></span> : null}
          </span>
        )}
      </span>
    );
  };
  const cloze: ClozeRenderConfig = { ids, render: renderBlank };
  const used = new Set(Object.values(chosen));

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-1.5" aria-label="단어 보기" data-testid="cloze-bank">
        {bank.map((b) => (
          <li key={b.id} className={cn('rounded-full border px-2.5 py-0.5 text-[13px]', used.has(b.id) ? 'border-line bg-muted text-ink-3 line-through' : 'border-line-strong bg-elevated text-ink')}>
            <Markdown inline className="prose-sm">{b.text}</Markdown>
          </li>
        ))}
      </ul>
      <div ref={root}>
        <Markdown className="text-[1.125rem] leading-[2.2]" cloze={cloze}>{question.prompt}</Markdown>
      </div>
      {!revealed ? <p className="text-[12px] text-ink-3">보기 풀에서 빈칸마다 하나씩 고르세요(각 보기 한 번만, 쓰이지 않는 보기도 있음). Enter: 다음 빈칸 / 제출</p> : null}
    </div>
  );
}
