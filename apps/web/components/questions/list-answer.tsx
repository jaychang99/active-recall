'use client';
import { Check, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { Input } from '@/components/ui/input';
import { isComposing } from '@/lib/shortcuts/manager';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'list_answer' }>;

/** Order-independent list of short answers: `answer.count` inputs. Enter moves to the next empty input, then submits. */
export function ListAnswer({ question, value, onChange, onSubmit, phase, grade, answerKey, readOnly }: RendererProps<Q>) {
  const count = question.answer.count;
  const entries = value?.type === 'list_answer' ? value.entries : [];
  const revealed = phase !== 'answering';
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { if (!revealed && !readOnly) inputs.current[0]?.focus(); }, [revealed, readOnly, question.id]);
  const parts = grade?.detail.parts ?? [];
  const items = ((answerKey?.answer as { items?: { id: string; acceptedAnswers: string[] }[] } | undefined)?.items ?? []) as { id: string; acceptedAnswers: string[] }[];
  const matchedIds = new Set(parts.filter((p) => p.correct).map((p) => p.expected as string));
  // parts are indexed over non-empty entries, in order
  const nonEmptyIndex = (i: number) => entries.slice(0, i + 1).filter((e) => e.trim().length > 0).length - 1;

  const set = (i: number, text: string) => {
    const next = [...entries];
    while (next.length < count) next.push('');
    next[i] = text;
    onChange({ type: 'list_answer', entries: next });
  };

  return (
    <div className="space-y-2">
      {!revealed ? <p className="text-[12px] text-ink-3">{count}개를 순서 없이 입력하세요. Enter: 다음 칸 / 마지막 칸에서 제출</p> : null}
      <ol className="space-y-1.5" data-testid="list-answer">
        {Array.from({ length: count }, (_, i) => {
          const text = entries[i] ?? '';
          const p = text.trim() ? parts[nonEmptyIndex(i)] : undefined;
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-muted text-[12px] font-semibold tabular text-ink-2">{i + 1}</span>
              <Input ref={(el) => { inputs.current[i] = el; }} value={text} disabled={revealed || readOnly} aria-label={`답 ${i + 1}`} autoComplete="off" className={cn('h-10 max-w-md text-[15px]', revealed && (p?.correct ? 'border-ok bg-ok-soft text-ok-ink' : text.trim() ? 'border-bad bg-bad-soft text-bad-ink' : ''))}
                onChange={(e) => set(i, e.target.value)}
                onKeyDown={(e) => {
                  if (isComposing(e.nativeEvent)) return;
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const next = inputs.current.slice(i + 1).find((el, k) => el && !(entries[i + 1 + k] ?? '').trim());
                    if (next) next.focus(); else onSubmit();
                  }
                }} />
              {revealed ? (p?.correct ? <Check className="h-4 w-4 text-ok" /> : text.trim() ? <X className="h-4 w-4 text-bad" /> : <span className="text-[12px] text-ink-3">미입력</span>) : null}
            </li>
          );
        })}
      </ol>
      {revealed ? (
        <div className="rounded-md border border-line bg-muted/60 px-3 py-2 text-sm">
          <div className="mb-1 text-[12px] font-semibold text-ink-3">정답 목록 {grade?.detail.note ? <span className="font-normal">· {grade.detail.note}</span> : null}</div>
          <ul className="space-y-0.5">
            {items.map((it) => (
              <li key={it.id} className={cn('flex items-start gap-1', matchedIds.has(it.id) ? 'text-ok-ink' : 'text-ink-2')}>
                {matchedIds.has(it.id) ? <Check className="mt-1 h-3.5 w-3.5 shrink-0" /> : <span className="mt-1 inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-line-strong" />}
                <Markdown inline className="prose-sm">{it.acceptedAnswers.join(' / ')}</Markdown>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
