'use client';
import { useEffect, useMemo } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { seededShuffle } from '@/lib/utils';
import { ChoiceList, type ChoiceView } from './choice-list';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'multiple_choice' }>;

export function MultipleChoice({ question, value, onChange, phase, answerKey, shuffleSeed, showKeyHints, readOnly, compact, registerDigitHandler }: RendererProps<Q>) {
  const ordered = useMemo(() => (shuffleSeed ? seededShuffle(question.choices, `${question.id}:${shuffleSeed}`) : question.choices), [question, shuffleSeed]);
  const selected = value?.type === 'multiple_choice' ? value.choiceIds : [];
  const correct = new Set(((answerKey?.answer as { choiceIds?: string[] } | undefined)?.choiceIds ?? []) as string[]);
  const revealed = phase !== 'answering';
  const disabled = revealed || !!readOnly;
  const toggle = (id: string) => {
    if (disabled) return;
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange({ type: 'multiple_choice', choiceIds: next });
  };
  useEffect(() => {
    registerDigitHandler?.((n) => {
      const c = ordered[n - 1];
      if (c) toggle(c.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, disabled, selected, registerDigitHandler]);
  const choices: ChoiceView[] = ordered.map((c, i) => ({ id: c.id, text: c.text, explanation: c.explanation, selected: selected.includes(c.id), correct: revealed ? correct.has(c.id) : null, index: i }));
  return (
    <div>
      <p className="mb-2 text-[12px] text-ink-3">해당하는 보기를 모두 선택하세요. 집합이 정확히 일치해야 정답입니다.</p>
      <ChoiceList choices={choices} multiple disabled={disabled} showKeyHints={showKeyHints} revealed={revealed} compact={compact} onToggle={toggle} />
    </div>
  );
}
