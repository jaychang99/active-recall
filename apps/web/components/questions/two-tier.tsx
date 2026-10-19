'use client';
import { useEffect, useMemo } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { seededShuffle } from '@/lib/utils';
import { ChoiceList, type ChoiceView } from './choice-list';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'two_tier' }>;

/** Answer + justification. Both lists are shuffled per round. Digits pick the answer first, then the reason. */
export function TwoTier({ question, value, onChange, phase, answerKey, shuffleSeed, showKeyHints, readOnly, compact, registerDigitHandler }: RendererProps<Q>) {
  const choices = useMemo(() => (shuffleSeed ? seededShuffle(question.choices, `${question.id}:c:${shuffleSeed}`) : question.choices), [question, shuffleSeed]);
  const reasons = useMemo(() => (shuffleSeed ? seededShuffle(question.reasons, `${question.id}:r:${shuffleSeed}`) : question.reasons), [question, shuffleSeed]);
  const choiceId = value?.type === 'two_tier' ? value.choiceId : null;
  const reasonId = value?.type === 'two_tier' ? value.reasonId : null;
  const key = answerKey?.answer as { choiceId?: string; reasonId?: string } | undefined;
  const revealed = phase !== 'answering';
  const disabled = revealed || !!readOnly;
  useEffect(() => {
    registerDigitHandler?.((n) => {
      if (disabled) return;
      if (choiceId === null) { const c = choices[n - 1]; if (c) onChange({ type: 'two_tier', choiceId: c.id, reasonId }); }
      else { const r = reasons[n - 1]; if (r) onChange({ type: 'two_tier', choiceId, reasonId: r.id }); }
    });
  }, [choices, reasons, choiceId, reasonId, disabled, onChange, registerDigitHandler]);
  const views = (list: typeof choices, sel: string | null, correctId: string | undefined): ChoiceView[] => list.map((c, i) => ({ id: c.id, text: c.text, explanation: c.explanation, selected: sel === c.id, correct: revealed ? c.id === correctId : null, index: i }));
  return (
    <div className="space-y-4">
      <section>
        <h4 className="mb-1.5 text-[13px] font-semibold text-ink-2">1단계 · 답</h4>
        <ChoiceList choices={views(choices, choiceId, key?.choiceId)} multiple={false} disabled={disabled} showKeyHints={showKeyHints && choiceId === null} revealed={revealed} compact={compact} onToggle={(id) => onChange({ type: 'two_tier', choiceId: id, reasonId })} />
      </section>
      <section className={choiceId === null && !revealed ? 'opacity-60' : ''}>
        <h4 className="mb-1.5 text-[13px] font-semibold text-ink-2">2단계 · 근거 {choiceId === null && !revealed ? <span className="font-normal text-ink-3">(답을 먼저 고르세요)</span> : null}</h4>
        <ChoiceList choices={views(reasons, reasonId, key?.reasonId)} multiple={false} disabled={disabled || choiceId === null} showKeyHints={showKeyHints && choiceId !== null} revealed={revealed} compact={compact} onToggle={(id) => onChange({ type: 'two_tier', choiceId, reasonId: id })} />
      </section>
      {!revealed ? <p className="text-[12px] text-ink-3">답과 근거가 모두 맞아야 정답입니다 (추측 배제).</p> : null}
    </div>
  );
}
