'use client';
import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { splitCloze, type PublicQuestion } from '@recall/contracts';
import { cn, seededShuffle } from '@/lib/utils';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'cloze_select' }>;

/** Cloze with a dropdown per blank. Option order is shuffled per round so position carries no information. */
export function ClozeSelect({ question, value, onChange, onSubmit, phase, grade, answerKey, shuffleSeed, readOnly }: RendererProps<Q>) {
  const chosen = value?.type === 'cloze_select' ? value.blanks : {};
  const revealed = phase !== 'answering';
  const segments = useMemo(() => splitCloze(question.prompt), [question.prompt]);
  const blanks = useMemo(() => new Map(question.blanks.map((b) => [b.id, shuffleSeed ? seededShuffle(b.options, `${question.id}:${b.id}:${shuffleSeed}`) : b.options])), [question, shuffleSeed]);
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const key = new Map((((answerKey?.blanks as { id: string; answerOptionId: string }[] | undefined) ?? []).map((b) => [b.id, b.answerOptionId])));
  const selects = useRef<(HTMLSelectElement | null)[]>([]);
  useEffect(() => { if (!revealed && !readOnly) selects.current[0]?.focus(); }, [revealed, readOnly, question.id]);
  let idx = -1;
  const optText = (bid: string, oid: string | null | undefined) => question.blanks.find((b) => b.id === bid)?.options.find((o) => o.id === oid)?.text ?? '';
  return (
    <div className="space-y-3">
      <div className="prose-q text-[1.125rem] leading-[2.2]">
        {segments.map((s, i) => {
          if (s.kind === 'text') return <Markdown key={i} inline>{s.text}</Markdown>;
          idx++;
          const my = idx;
          const p = parts.get(s.id);
          return (
            <span key={s.id} className="mx-0.5 inline-flex items-center gap-1 align-baseline">
              {!revealed ? (
                <select ref={(el) => { selects.current[my] = el; }} value={chosen[s.id] ?? ''} disabled={readOnly} aria-label={`빈칸 ${my + 1}`} data-blank-id={s.id}
                  className="h-8 rounded-md border border-line-strong bg-elevated px-2 text-[0.95rem]"
                  onChange={(e) => onChange({ type: 'cloze_select', blanks: { ...chosen, [s.id]: e.target.value } })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const next = selects.current[my + 1]; if (next && !chosen[next.dataset.blankId ?? '']) next.focus(); else onSubmit(); } }}>
                  <option value="">— 선택 —</option>
                  {blanks.get(s.id)?.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
                </select>
              ) : (
                <span className={cn('rounded-md border px-2 py-0.5 text-[0.95rem]', p?.correct ? 'border-ok bg-ok-soft text-ok-ink' : 'border-bad bg-bad-soft text-bad-ink')}>
                  {p?.correct ? <Check className="mr-1 inline h-3.5 w-3.5" /> : <X className="mr-1 inline h-3.5 w-3.5" />}
                  <Markdown inline>{optText(s.id, chosen[s.id]) || '(미선택)'}</Markdown>
                  {!p?.correct ? <span className="ml-1 text-[12px]">→ <Markdown inline>{optText(s.id, key.get(s.id))}</Markdown></span> : null}
                </span>
              )}
            </span>
          );
        })}
      </div>
      {!revealed ? <p className="text-[12px] text-ink-3">각 빈칸에서 보기를 고르세요. Enter: 다음 빈칸 / 제출</p> : null}
    </div>
  );
}
