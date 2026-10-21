'use client';
import { Check, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { cn, seededShuffle } from '@/lib/utils';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'statement_set' }>;

/** Several statements, each judged true/false. Row order is shuffled per round. Keys: 1-9 focus row, O/X or arrow keys set. */
export function StatementSet({ question, value, onChange, phase, grade, answerKey, shuffleSeed, showKeyHints, readOnly, registerDigitHandler }: RendererProps<Q>) {
  const vals = value?.type === 'statement_set' ? value.values : {};
  const revealed = phase !== 'answering';
  const rows = useMemo(() => (shuffleSeed ? seededShuffle(question.statements, `${question.id}:${shuffleSeed}`) : question.statements), [question, shuffleSeed]);
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const key = new Map((((answerKey?.statements as { id: string; value: boolean; explanation?: string }[] | undefined) ?? []).map((s) => [s.id, s])));
  const set = (id: string, v: boolean) => { if (!revealed && !readOnly) onChange({ type: 'statement_set', values: { ...vals, [id]: v } }); };
  useEffect(() => {
    // digit n toggles row n: first press → O, second press → X
    registerDigitHandler?.((n) => { const r = rows[n - 1]; if (r) set(r.id, vals[r.id] === true ? false : true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, vals, revealed, readOnly, registerDigitHandler]);
  return (
    <div className="space-y-2">
      {!revealed ? <p className="text-[12px] text-ink-3">각 진술이 참(O)인지 거짓(X)인지 표시하세요. 숫자키는 해당 줄을 O→X로 토글합니다.</p> : null}
      <ul className="divide-y divide-line rounded-md border border-line" data-testid="statement-list">
        {rows.map((s, i) => {
          const p = parts.get(s.id);
          const cur = vals[s.id];
          return (
            <li key={s.id} className={cn('flex items-start gap-3 px-3 py-2', revealed && (p?.correct ? 'bg-ok-soft/50' : 'bg-bad-soft/50'))}>
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded bg-muted text-[12px] font-semibold tabular text-ink-2">{showKeyHints ? i + 1 : ''}</span>
              <div className="min-w-0 flex-1">
                <Markdown className="prose-sm">{s.text}</Markdown>
                {revealed ? (
                  <div className={cn('mt-1 flex items-center gap-1 text-[12px] font-medium', p?.correct ? 'text-ok-ink' : 'text-bad-ink')}>
                    {p?.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    정답: {key.get(s.id)?.value ? 'O (참)' : 'X (거짓)'}{cur === undefined || cur === null ? ' · 미응답' : ''}
                    {key.get(s.id)?.explanation ? <span className="ml-1 font-normal text-ink-2">— <Markdown inline className="prose-inherit">{key.get(s.id)!.explanation!}</Markdown></span> : null}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={`진술 ${i + 1}`}>
                {([true, false] as const).map((b) => (
                  <button key={String(b)} type="button" role="radio" aria-checked={cur === b} disabled={revealed || readOnly} onClick={() => set(s.id, b)}
                    className={cn('h-8 w-9 rounded-md border text-sm font-semibold', cur === b ? (b ? 'border-accent bg-accent text-accent-ink' : 'border-ink-2 bg-ink-2 text-bg') : 'border-line text-ink-2 hover:border-line-strong')}>
                    {b ? 'O' : 'X'}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
