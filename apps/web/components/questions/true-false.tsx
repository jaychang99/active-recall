'use client';
import { useEffect } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { ChoiceList } from './choice-list';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'true_false' }>;

export function TrueFalse({ value, onChange, phase, answerKey, showKeyHints, readOnly, compact, registerDigitHandler }: RendererProps<Q>) {
  const selected = value?.type === 'true_false' ? value.value : null;
  const correct = (answerKey?.answer as { value?: boolean } | undefined)?.value ?? null;
  const revealed = phase !== 'answering';
  const disabled = revealed || !!readOnly;
  useEffect(() => {
    registerDigitHandler?.((n) => {
      if (disabled) return;
      if (n === 1) onChange({ type: 'true_false', value: true });
      if (n === 2) onChange({ type: 'true_false', value: false });
    });
  }, [disabled, onChange, registerDigitHandler]);
  const opts = [
    { id: 'true', text: 'O — 참 (True)', v: true },
    { id: 'false', text: 'X — 거짓 (False)', v: false },
  ];
  return (
    <ChoiceList
      choices={opts.map((o, i) => ({ id: o.id, text: o.text, selected: selected === o.v, correct: revealed ? correct === o.v : null, index: i }))}
      multiple={false}
      disabled={disabled}
      showKeyHints={showKeyHints}
      revealed={revealed}
      compact={compact}
      onToggle={(id) => onChange({ type: 'true_false', value: id === 'true' })}
    />
  );
}
