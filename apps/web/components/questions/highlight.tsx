'use client';
import { useEffect } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { cn } from '@/lib/utils';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'highlight' }>;

/** Select the segments that apply (errors, evidence). Segment order is the passage itself, so never shuffled. Digits 1-9 toggle the first nine segments. */
export function Highlight({ question, value, onChange, phase, grade, answerKey, showKeyHints, readOnly, registerDigitHandler }: RendererProps<Q>) {
  const sel = new Set(value?.type === 'highlight' ? value.segmentIds : []);
  const revealed = phase !== 'answering';
  const expected = new Set(((answerKey?.answer as { segmentIds?: string[] } | undefined)?.segmentIds ?? []) as string[]);
  const toggle = (id: string) => {
    if (revealed || readOnly) return;
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ type: 'highlight', segmentIds: [...next] });
  };
  useEffect(() => { registerDigitHandler?.((n) => { const s = question.segments[n - 1]; if (s) toggle(s.id); }); });
  return (
    <div className="space-y-2">
      {!revealed ? <p className="text-[12px] text-ink-3">해당하는 조각을 모두 클릭(또는 1–9 키)해서 표시하세요.</p> : null}
      <p className="prose-q leading-[2.1]" data-testid="highlight-passage">
        {question.segments.map((s, i) => {
          const chosen = sel.has(s.id);
          const isAns = expected.has(s.id);
          const state = !revealed ? (chosen ? 'sel' : 'idle') : isAns && chosen ? 'hit' : isAns ? 'missed' : chosen ? 'wrong' : 'idle';
          return (
            <button key={s.id} type="button" aria-pressed={chosen} disabled={revealed || readOnly} onClick={() => toggle(s.id)} data-segment-id={s.id}
              className={cn('mx-0.5 rounded px-1 py-0.5 text-left transition-colors disabled:cursor-default', state === 'idle' && 'hover:bg-muted', state === 'sel' && 'bg-accent-soft text-accent-soft-ink ring-1 ring-accent', state === 'hit' && 'bg-ok-soft text-ok-ink ring-1 ring-ok', state === 'missed' && 'bg-ok-soft/50 text-ok-ink ring-1 ring-dashed ring-ok', state === 'wrong' && 'bg-bad-soft text-bad-ink line-through ring-1 ring-bad')}>
              {showKeyHints && i < 9 && !revealed ? <sup className="mr-0.5 text-[10px] text-ink-3">{i + 1}</sup> : null}{s.text}
            </button>
          );
        })}
      </p>
      {revealed ? <p className="text-[12px] text-ink-3">초록 = 정답 조각(점선: 놓침) · 빨강 취소선 = 잘못 선택 · 부분 일치 {grade ? Math.round((grade.detail.partialRatio ?? 0) * 100) : 0}% (정답 인정 아님)</p> : null}
    </div>
  );
}
