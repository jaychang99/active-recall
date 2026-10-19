'use client';
import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { cn, seededShuffle } from '@/lib/utils';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'matching' }>;

export function Matching({ question, value, onChange, onSubmit, phase, grade, answerKey, shuffleSeed, readOnly, registerDigitHandler }: RendererProps<Q>) {
  const right = useMemo(() => (shuffleSeed ? seededShuffle(question.right, `${question.id}:${shuffleSeed}`) : question.right), [question, shuffleSeed]);
  const pairs = value?.type === 'matching' ? value.pairs : [];
  const chosen = new Map(pairs.map((p) => [p.leftId, p.rightId]));
  const revealed = phase !== 'answering';
  const disabled = revealed || !!readOnly;
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const expected = new Map((((answerKey?.answer as { pairs?: { leftId: string; rightId: string }[] } | undefined)?.pairs ?? []).map((p) => [p.leftId, p.rightId])));
  const rightText = (id: string | null | undefined) => question.right.find((r) => r.id === id)?.text ?? '';
  const selects = useRef<(HTMLSelectElement | null)[]>([]);
  useEffect(() => {
    if (!revealed && !readOnly) selects.current[0]?.focus();
  }, [revealed, readOnly, question.id]);
  useEffect(() => {
    registerDigitHandler?.((n) => selects.current[n - 1]?.focus());
  }, [registerDigitHandler]);

  const set = (leftId: string, rightId: string | null) => {
    if (disabled) return;
    const next = question.left.map((l) => ({ leftId: l.id, rightId: l.id === leftId ? rightId : (chosen.get(l.id) ?? null) }));
    onChange({ type: 'matching', pairs: next });
  };
  const letter = (i: number) => String.fromCharCode(65 + i);

  return (
    <div className="space-y-3">
      {!revealed ? <p className="text-[12px] text-ink-3">왼쪽 항목마다 오른쪽 항목을 하나씩 고르세요 (1:1). 선택 상자에서 문자 키 A–L로 빠르게 선택, Enter로 제출</p> : null}
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <ul className="space-y-2" data-testid="matching-left">
          {question.left.map((l, i) => {
            const cur = chosen.get(l.id) ?? null;
            const p = parts.get(l.id);
            return (
              <li key={l.id} className={cn('grid items-center gap-2 rounded-md border px-3 py-2 sm:grid-cols-[1fr_1fr]', revealed ? (p?.correct ? 'border-ok bg-ok-soft' : 'border-bad bg-bad-soft') : 'border-line bg-elevated')}>
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-muted text-[12px] font-semibold tabular text-ink-2">{i + 1}</span>
                  <Markdown className="prose-sm">{l.text}</Markdown>
                </div>
                {!revealed ? (
                  <select
                    ref={(el) => { selects.current[i] = el; }}
                    value={cur ?? ''}
                    disabled={disabled}
                    aria-label={`${l.text}에 연결할 항목`}
                    className="h-9 rounded-md border border-line-strong bg-elevated px-2 text-sm"
                    onChange={(e) => set(l.id, e.target.value || null)}
                    onKeyDown={(e) => {
                      const k = e.key.toUpperCase();
                      const idx = k.charCodeAt(0) - 65;
                      if (k.length === 1 && idx >= 0 && idx < right.length) { e.preventDefault(); set(l.id, right[idx]!.id); selects.current[i + 1]?.focus(); }
                      if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
                    }}
                  >
                    <option value="">— 선택 —</option>
                    {right.map((r, j) => (
                      <option key={r.id} value={r.id}>{letter(j)}. {r.text}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm">
                    <div className={cn('flex items-center gap-1 font-medium', p?.correct ? 'text-ok-ink' : 'text-bad-ink')}>
                      {p?.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      {cur ? <Markdown inline className="prose-sm">{rightText(cur)}</Markdown> : '선택 없음'}
                    </div>
                    {!p?.correct ? <div className="text-[13px] text-ink-2">정답: <Markdown inline className="prose-sm">{rightText(expected.get(l.id))}</Markdown></div> : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {!revealed ? (
          <ol className="space-y-1 rounded-md border border-line bg-muted/50 p-3 text-sm md:min-w-56" aria-label="오른쪽 항목">
            {right.map((r, j) => (
              <li key={r.id} className="flex gap-2"><span className="font-semibold tabular text-ink-2">{letter(j)}.</span><Markdown className="prose-sm">{r.text}</Markdown></li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
