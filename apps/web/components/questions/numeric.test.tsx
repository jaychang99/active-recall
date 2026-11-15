import { fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { AnswerPayload, PublicQuestion } from '@recall/contracts';
import { Numeric, parseNumericInput } from './numeric';

const question = { id: 'q1', type: 'numeric', prompt: 'p', difficulty: 1, tags: [] } as unknown as Extract<PublicQuestion, { type: 'numeric' }>;

function Controlled({ initial = null as AnswerPayload | null, seen }: { initial?: AnswerPayload | null; seen: (AnswerPayload | null)[] }) {
  const [value, setValue] = useState<AnswerPayload | null>(initial);
  return <Numeric question={question} value={value} onChange={(v) => { seen.push(v); setValue(v); }} onSubmit={() => {}} phase="answering" grade={null} answerKey={null} shuffleSeed={null} showKeyHints={false} />;
}

describe('numeric input', () => {
  it('parses decimals, negatives and thousands separators', () => {
    expect(parseNumericInput('3.14')).toBe(3.14);
    expect(parseNumericInput('-0.5')).toBe(-0.5);
    expect(parseNumericInput('1,234.5')).toBe(1234.5);
    expect(parseNumericInput('')).toBeNull();
    expect(parseNumericInput('-')).toBeNull();
  });

  it('keeps a trailing decimal point and leading zeros while typing a decimal', () => {
    const seen: (AnswerPayload | null)[] = [];
    const { getByLabelText } = render(<Controlled seen={seen} />);
    const input = getByLabelText('숫자 답안') as HTMLInputElement;
    for (const s of ['3', '3.', '3.0', '3.05']) {
      fireEvent.change(input, { target: { value: s } });
      expect(input.value).toBe(s);
    }
    expect(seen.at(-1)).toEqual({ type: 'numeric', value: 3.05 });
    for (const s of ['-', '-0', '-0.', '-0.5']) {
      fireEvent.change(input, { target: { value: s } });
      expect(input.value).toBe(s);
    }
    expect(seen.at(-1)).toEqual({ type: 'numeric', value: -0.5 });
  });

  it('shows a restored value', () => {
    const { getByLabelText } = render(<Controlled initial={{ type: 'numeric', value: 2.5 }} seen={[]} />);
    expect((getByLabelText('숫자 답안') as HTMLInputElement).value).toBe('2.5');
  });
});
