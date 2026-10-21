import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChoiceList } from './choice-list';
import { StatementSet } from './statement-set';

describe('per-item explanations render Markdown + KaTeX', () => {
  it('choice explanations', () => {
    const { container } = render(
      <ChoiceList multiple={false} onToggle={() => {}} disabled showKeyHints={false} revealed
        choices={[{ id: 'a', text: '$x$', explanation: '$x^2 = 4$ 이므로 **오답**', selected: true, correct: false, index: 0 }]} />,
    );
    const li = container.querySelector('li')!;
    expect(li.querySelectorAll('.katex')).toHaveLength(2);
    expect(li.querySelector('strong')?.textContent).toBe('오답');
    expect(li.textContent).not.toContain('$');
  });

  it('statement explanations', () => {
    const question = { id: 'q1', type: 'statement_set', prompt: 'p', statements: [{ id: 's1', text: '$a$' }] } as never;
    const { container } = render(
      <StatementSet question={question} value={{ type: 'statement_set', values: { s1: true } }} onChange={() => {}} onSubmit={() => {}} phase="revealed" grade={null}
        answerKey={{ statements: [{ id: 's1', value: false, explanation: '$\\frac{1}{2}$ 이다' }] }} shuffleSeed={null} showKeyHints={false} readOnly={false} />,
    );
    expect(container.querySelectorAll('.katex')).toHaveLength(2);
    expect(container.textContent).not.toContain('$');
  });
});
