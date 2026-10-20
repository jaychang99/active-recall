import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicQuestion } from '@recall/contracts';
import { Cloze } from './cloze';
import { ClozeSelect } from './cloze-select';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

// Diagrams are rendered by mermaid in the browser; here we only need to see the text that reaches the block.
vi.mock('./rich-blocks', () => ({
  MermaidBlock: ({ code }: { code: string }) => <pre data-testid="mermaid-block">{code}</pre>,
  SvgBlock: ({ code }: { code: string }) => <pre data-testid="svg-block">{code}</pre>,
}));

const base = { value: null, onChange: () => {}, onSubmit: () => {}, phase: 'answering' as const, grade: null, answerKey: null, shuffleSeed: null, showKeyHints: false };

const clozeQ = (prompt: string, ids: string[]): Extract<PublicQuestion, { type: 'cloze' }> =>
  ({ id: 'q1', type: 'cloze', prompt, difficulty: 1, tags: [], blanks: ids.map((id) => ({ id })) }) as unknown as Extract<PublicQuestion, { type: 'cloze' }>;

describe('cloze blanks inside Markdown structures', () => {
  it('renders a GFM table cell blank as an input inside the <td>', () => {
    const q = clozeQ('| 계층 | 번호 |\n|---|---|\n| 전송 | {{b1}} |\n| 네트워크 | {{b2}} |', ['b1', 'b2']);
    const { container } = render(<Cloze {...base} question={q} />);
    expect(container.querySelectorAll('table').length).toBe(1);
    expect(container.querySelectorAll('tr').length).toBe(3);
    expect(container.querySelector('td input[data-blank-id="b1"]')).not.toBeNull();
    expect(container.querySelector('td input[data-blank-id="b2"]')).not.toBeNull();
    expect(container.textContent).not.toContain('{{b1}}');
  });

  it('renders an HTML table cell blank (rowspan table through rehype-raw) as an input inside the <td>', () => {
    const q = clozeQ('<table><tr><td rowspan="2">OSI</td><td>{{b1}}</td></tr><tr><td>{{b2}}</td></tr></table>', ['b1', 'b2']);
    const { container } = render(<Cloze {...base} question={q} />);
    expect(container.querySelector('td[rowspan="2"]')).not.toBeNull();
    expect(container.querySelectorAll('td input[data-blank-id]').length).toBe(2);
  });

  it('keeps plain-paragraph cloze behaviour: inputs in order, Enter moves to the next empty blank then submits', () => {
    const onSubmit = vi.fn();
    const q = clozeQ('전송 계층은 {{b1}}계층이며, TCP는 {{b2}} 지향이다.', ['b1', 'b2']);
    const { container } = render(<Cloze {...base} question={q} onSubmit={onSubmit} value={{ type: 'cloze', blanks: { b1: '4' } }} />);
    const inputs = container.querySelectorAll<HTMLInputElement>('input[data-blank-id]');
    expect([...inputs].map((i) => i.dataset.blankId)).toEqual(['b1', 'b2']);
    expect(document.activeElement).toBe(inputs[0]);
    fireEvent.keyDown(inputs[0]!, { key: 'Enter' });
    expect(document.activeElement).toBe(inputs[1]);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(inputs[1]!, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows per-blank verdicts and accepted answers after reveal', () => {
    const q = clozeQ('{{b1}} 와 {{b2}}', ['b1', 'b2']);
    const grade = { isCorrect: false, gradable: true, detail: { parts: [{ id: 'b1', correct: true }, { id: 'b2', correct: false }] } } as unknown as RendererProps['grade'];
    const answerKey = { blanks: [{ id: 'b1', acceptedAnswers: ['A'] }, { id: 'b2', acceptedAnswers: ['B', 'b'] }] };
    const { container } = render(<Cloze {...base} question={q} phase="revealed" grade={grade} answerKey={answerKey} value={{ type: 'cloze', blanks: { b1: 'A', b2: 'x' } }} />);
    expect(container.querySelector('input[data-blank-id="b1"]')?.className).toContain('border-ok');
    expect(container.querySelector('input[data-blank-id="b2"]')?.className).toContain('border-bad');
    expect(container.textContent).toContain('인정 답안: B / b');
  });

  it('does not touch {{id}} inside ordinary code (fence and inline)', () => {
    const q = clozeQ('템플릿 `{{b1}}` 문법은 {{b1}}에서 쓴다.\n\n```js\nconst t = "{{b1}}";\n```', ['b1']);
    const { container } = render(<Cloze {...base} question={q} />);
    expect(container.querySelectorAll('input[data-blank-id="b1"]').length).toBe(1);
    expect(container.querySelector('code')?.textContent).toBe('{{b1}}');
    expect(container.querySelector('pre code')?.textContent).toContain('"{{b1}}"');
  });

  it('turns mermaid blanks into ①② labels with the inputs listed under the diagram, numbered by blank order', () => {
    const q = clozeQ('상태 전이:\n\n```mermaid\nstateDiagram-v2\n    Ready --> {{b2}}: dispatch\n    {{b2}} --> {{b1}}: I/O\n```\n\n그리고 {{b3}}.', ['b1', 'b2', 'b3']);
    const { container } = render(<Cloze {...base} question={q} />);
    const code = container.querySelector('[data-testid="mermaid-block"]')?.textContent ?? '';
    expect(code).toContain('Ready --> ②: dispatch');
    expect(code).toContain('② --> ①: I/O');
    expect(code).not.toContain('{{');
    const list = container.querySelector('[data-testid="diagram-blanks"]')!;
    expect([...list.querySelectorAll<HTMLInputElement>('input[data-blank-id]')].map((i) => i.dataset.blankId)).toEqual(['b2', 'b1']);
    expect(list.textContent).toContain('②');
    // document order: diagram list first (b2, b1), then the paragraph blank b3
    expect([...container.querySelectorAll<HTMLInputElement>('input[data-blank-id]')].map((i) => i.dataset.blankId)).toEqual(['b2', 'b1', 'b3']);
  });

  it('cloze_select renders a <select> inside a table cell and labels svg blanks', () => {
    const q = {
      id: 'q2', type: 'cloze_select', prompt: '| 항목 | 값 |\n|---|---|\n| X | {{s1}} |\n\n```svg\n<svg viewBox="0 0 10 10"><text>{{s2}}</text></svg>\n```', difficulty: 1, tags: [],
      blanks: [{ id: 's1', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }, { id: 's2', options: [{ id: 'a', text: 'C' }, { id: 'b', text: 'D' }] }],
    } as unknown as Extract<PublicQuestion, { type: 'cloze_select' }>;
    const { container } = render(<ClozeSelect {...base} question={q} />);
    expect(container.querySelector('td select[data-blank-id="s1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="svg-block"]')?.textContent).toContain('<text>②</text>');
    expect(container.querySelector('[data-testid="diagram-blanks"] select[data-blank-id="s2"]')).not.toBeNull();
  });

  it('leaves {{id}} literal when Markdown is rendered without cloze config', () => {
    const { container } = render(<Markdown>{'값은 {{b1}} 이다'}</Markdown>);
    expect(container.textContent).toContain('{{b1}}');
    expect(container.querySelector('input')).toBeNull();
  });
});
