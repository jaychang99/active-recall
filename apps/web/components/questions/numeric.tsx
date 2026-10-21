'use client';
import { focusAnswerInput } from '@/lib/answer-focus';
import { Check, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { Input } from '@/components/ui/input';
import { isComposing } from '@/lib/shortcuts/manager';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'numeric' }>;

export function Numeric({ question, value, onChange, onSubmit, phase, grade, answerKey, readOnly }: RendererProps<Q>) {
  const v = value?.type === 'numeric' ? value.value : null;
  const revealed = phase !== 'answering';
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!revealed && !readOnly) focusAnswerInput(ref.current); }, [revealed, readOnly]);
  const key = answerKey?.answer as { value?: number; tolerance?: number; relativeTolerance?: number; unit?: string } | undefined;
  const correct = grade?.isCorrect ?? null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input ref={ref} type="text" inputMode="decimal" value={v === null ? '' : String(v)} disabled={revealed || readOnly} placeholder="숫자 입력 후 Enter" aria-label="숫자 답안" className="h-11 max-w-xs text-base tabular" autoComplete="off"
          onChange={(e) => { const n = Number(e.target.value.replace(/,/g, '')); onChange({ type: 'numeric', value: e.target.value.trim() === '' || Number.isNaN(n) ? null : n }); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !isComposing(e.nativeEvent)) { e.preventDefault(); onSubmit(); } }} />
        {question.answer?.unit ? <span className="text-ink-2">{question.answer.unit}</span> : null}
      </div>
      {revealed && key ? (
        <div className="rounded-md border border-line bg-muted/60 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 font-medium">
            {correct ? <><Check className="h-4 w-4 text-ok" /><span className="text-ok-ink">정답</span></> : <><X className="h-4 w-4 text-bad" /><span className="text-bad-ink">오답</span></>}
            <span className="text-ink-3">· 입력: <span className="text-ink tabular">{v ?? '—'}</span></span>
          </div>
          <div className="mt-1 text-ink-2 tabular">정답: {key.value}{key.unit ? ` ${key.unit}` : ''}{grade?.detail.note ? <span className="text-ink-3"> (허용 오차 {grade.detail.note})</span> : null}</div>
        </div>
      ) : null}
    </div>
  );
}
