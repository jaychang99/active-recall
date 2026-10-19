'use client';
import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { splitCloze, type PublicQuestion } from '@recall/contracts';
import { isComposing } from '@/lib/shortcuts/manager';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'cloze' }>;

export function Cloze({ question, value, onChange, onSubmit, phase, grade, answerKey, readOnly }: RendererProps<Q>) {
  const blanks = value?.type === 'cloze' ? value.blanks : {};
  const revealed = phase !== 'answering';
  const segments = useMemo(() => splitCloze(question.prompt), [question.prompt]);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    if (!revealed && !readOnly) inputs.current[0]?.focus();
  }, [revealed, readOnly, question.id]);
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const key = new Map((((answerKey?.blanks as { id: string; acceptedAnswers: string[] }[] | undefined) ?? []).map((b) => [b.id, b.acceptedAnswers])));
  let idx = -1;
  return (
    <div className="space-y-3">
      <div className="prose-q text-[1.125rem] leading-[2.1]">
        {segments.map((s, i) => {
          if (s.kind === 'text') return <Markdown key={i} inline>{s.text}</Markdown>;
          idx++;
          const myIdx = idx;
          const p = parts.get(s.id);
          const width = Math.max(6, (blanks[s.id]?.length ?? 0) + 2, ...(key.get(s.id)?.map((a) => a.length + 2) ?? []));
          return (
            <span key={s.id} className="mx-0.5 inline-flex items-center align-baseline">
              <input
                ref={(el) => { inputs.current[myIdx] = el; }}
                value={blanks[s.id] ?? ''}
                disabled={revealed || readOnly}
                aria-label={`빈칸 ${myIdx + 1}`}
                data-blank-id={s.id}
                autoComplete="off"
                style={{ width: `${width}ch` }}
                className={cn('h-8 rounded-md border bg-elevated px-2 text-center text-[1rem] outline-none focus-visible:border-accent', revealed ? (p?.correct ? 'border-ok bg-ok-soft text-ok-ink' : 'border-bad bg-bad-soft text-bad-ink') : 'border-line-strong')}
                onChange={(e) => onChange({ type: 'cloze', blanks: { ...blanks, [s.id]: e.target.value } })}
                onKeyDown={(e) => {
                  if (isComposing(e.nativeEvent)) return;
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const next = inputs.current[myIdx + 1];
                    if (next && !(blanks[next.dataset.blankId ?? ''] ?? '').length) next.focus();
                    else onSubmit();
                  }
                }}
              />
              {revealed ? (
                <span className={cn('ml-1 inline-flex items-center gap-0.5 text-[12px] font-medium', p?.correct ? 'text-ok-ink' : 'text-bad-ink')}>
                  {p?.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  {!p?.correct ? <span>정답: {key.get(s.id)?.[0]}</span> : null}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
      {!revealed ? <p className="text-[12px] text-ink-3">Enter: 다음 빈칸으로 이동, 마지막 빈칸에서 Enter: 제출 · Tab으로도 이동</p> : null}
      {revealed ? (
        <div className="text-[13px] text-ink-2">
          {[...key.entries()].map(([id, acc]) => (
            <div key={id}>빈칸 <code className="rounded bg-muted px-1">{id}</code> 인정 답안: {acc.join(' / ')}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
