'use client';
import { useEffect, useMemo } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { seededShuffle } from '@/lib/utils';
import { ChoiceList, type ChoiceView } from './choice-list';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'single_choice' }>;

export function SingleChoice({ question, value, onChange, phase, answerKey, shuffleSeed, showKeyHints, readOnly, compact, registerDigitHandler }: RendererProps<Q>) {
  const ordered = useMemo(() => (shuffleSeed ? seededShuffle(question.choices, `${question.id}:${shuffleSeed}`) : question.choices), [question, shuffleSeed]);
  const selected = value?.type === 'single_choice' ? value.choiceId : null;
  const correctId = (answerKey?.answer as { choiceId?: string } | undefined)?.choiceId ?? null;
  const revealed = phase !== 'answering';
  const disabled = revealed || !!readOnly;

  useEffect(() => {
    registerDigitHandler?.((n) => {
      const c = ordered[n - 1];
      if (c && !disabled) onChange({ type: 'single_choice', choiceId: c.id });
    });
  }, [ordered, disabled, onChange, registerDigitHandler]);

  const choices: ChoiceView[] = ordered.map((c, i) => ({ id: c.id, text: c.text, explanation: c.explanation, selected: selected === c.id, correct: revealed ? c.id === correctId : null, index: i }));
  return <ChoiceList choices={choices} multiple={false} disabled={disabled} showKeyHints={showKeyHints} revealed={revealed} compact={compact} onToggle={(id) => onChange({ type: 'single_choice', choiceId: id })} />;
}
