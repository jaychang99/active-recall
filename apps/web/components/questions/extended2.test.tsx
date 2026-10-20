import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicQuestion } from '@recall/contracts';
import { CodeCloze } from './code-cloze';
import { ClozeBank } from './cloze-bank';
import { FindAndFix } from './find-and-fix';
import { ListAnswer } from './list-answer';
import { Matrix } from './matrix';
import { Parsons } from './parsons';
import { RegexAnswer } from './regex-answer';
import type { RendererProps } from './types';

vi.mock('./rich-blocks', () => ({ MermaidBlock: () => null, SvgBlock: () => null }));

const base = { value: null, onChange: () => {}, onSubmit: () => {}, phase: 'answering' as const, grade: null, answerKey: null, shuffleSeed: null, showKeyHints: true };
const q = <T,>(o: Record<string, unknown>) => ({ id: 'q1', prompt: 'p', difficulty: 1, tags: [], ...o }) as unknown as T;

describe('extended set-2 renderers', () => {
  it('code_cloze: inputs replace placeholders inside the code block in order; Enter advances then submits', () => {
    const onSubmit = vi.fn();
    const question = q<Extract<PublicQuestion, { type: 'code_cloze' }>>({ type: 'code_cloze', language: 'python', code: 'x = {{a}}\ny = {{b}}', blanks: [{ id: 'a' }, { id: 'b' }] });
    const { container } = render(<CodeCloze {...base} question={question} onSubmit={onSubmit} value={{ type: 'code_cloze', blanks: { a: '1' } }} />);
    const inputs = container.querySelectorAll<HTMLInputElement>('input[data-blank-id]');
    expect([...inputs].map((i) => i.dataset.blankId)).toEqual(['a', 'b']);
    expect(container.textContent).not.toContain('{{a}}');
    expect(container.textContent).toContain('python');
    fireEvent.keyDown(inputs[0]!, { key: 'Enter' });
    expect(document.activeElement).toBe(inputs[1]);
    fireEvent.keyDown(inputs[1]!, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('cloze_bank: every blank offers the whole bank and the bank chips mark used items', () => {
    const question = q<Extract<PublicQuestion, { type: 'cloze_bank' }>>({ type: 'cloze_bank', prompt: 'A {{b1}} B {{b2}}', bank: [{ id: 'k1', text: 'one' }, { id: 'k2', text: 'two' }, { id: 'k3', text: 'three' }], blanks: [{ id: 'b1' }, { id: 'b2' }] });
    const onChange = vi.fn();
    const { container } = render(<ClozeBank {...base} question={question} onChange={onChange} value={{ type: 'cloze_bank', blanks: { b1: 'k1' } }} />);
    const selects = container.querySelectorAll<HTMLSelectElement>('select[data-blank-id]');
    expect(selects.length).toBe(2);
    expect(selects[1]!.querySelectorAll('option').length).toBe(4);
    expect(container.querySelector('[data-testid="cloze-bank"] li')?.className).toContain('line-through');
    fireEvent.change(selects[1]!, { target: { value: 'k1' } }); // moving an item clears the other blank
    expect(onChange).toHaveBeenCalledWith({ type: 'cloze_bank', blanks: { b2: 'k1' } });
  });

  it('matrix: toggles cells, single mode keeps one per row, reveal colors rows', () => {
    const question = q<Extract<PublicQuestion, { type: 'matrix' }>>({ type: 'matrix', rows: [{ id: 'r1', text: 'R1' }], columns: [{ id: 'c1', text: 'C1' }, { id: 'c2', text: 'C2' }], selection: 'single' });
    const onChange = vi.fn();
    const { container, rerender } = render(<Matrix {...base} question={question} onChange={onChange} value={{ type: 'matrix', cells: [{ rowId: 'r1', columnId: 'c1' }] }} />);
    fireEvent.click(container.querySelector('input[data-cell="r1:c2"]')!);
    expect(onChange).toHaveBeenCalledWith({ type: 'matrix', cells: [{ rowId: 'r1', columnId: 'c2' }] });
    const grade = { isCorrect: false, gradable: true, detail: { parts: [{ id: 'r1', correct: false }] } } as unknown as RendererProps['grade'];
    rerender(<Matrix {...base} question={question} onChange={onChange} phase="revealed" grade={grade} answerKey={{ answer: { cells: [{ rowId: 'r1', columnId: 'c2' }] } }} value={{ type: 'matrix', cells: [{ rowId: 'r1', columnId: 'c1' }] }} />);
    expect(container.textContent).toContain('행 오답');
    expect(container.querySelector('input[data-cell="r1:c2"]')?.closest('label')?.className).toContain('border-dashed');
  });

  it('list_answer renders `count` inputs and lists the key after reveal', () => {
    const question = q<Extract<PublicQuestion, { type: 'list_answer' }>>({ type: 'list_answer', answer: { count: 3 } });
    const { container, rerender } = render(<ListAnswer {...base} question={question} />);
    expect(container.querySelectorAll('input').length).toBe(3);
    const grade = { isCorrect: false, gradable: true, detail: { parts: [{ id: 'entry-1', correct: true, expected: 'a' }, { id: 'entry-2', correct: false }], note: '1/3 named, 1 wrong' } } as unknown as RendererProps['grade'];
    rerender(<ListAnswer {...base} question={question} phase="revealed" grade={grade} answerKey={{ answer: { items: [{ id: 'a', acceptedAnswers: ['Alpha'] }, { id: 'b', acceptedAnswers: ['Beta'] }, { id: 'c', acceptedAnswers: ['Gamma'] }] } }} value={{ type: 'list_answer', entries: ['Alpha', 'nope', ''] }} />);
    expect(container.textContent).toContain('Gamma');
    expect(container.textContent).toContain('1/3 named');
    expect(container.querySelectorAll('input')[1]!.className).toContain('border-bad');
  });

  it('parsons: pool blocks move into the solution and keys adjust order/indent', () => {
    const question = q<Extract<PublicQuestion, { type: 'parsons' }>>({ type: 'parsons', blocks: [{ id: 'a', code: 'def f():' }, { id: 'b', code: 'return 1' }, { id: 'd', code: 'pass' }] });
    const onChange = vi.fn();
    const { container, rerender } = render(<Parsons {...base} question={question} onChange={onChange} value={{ type: 'parsons', lines: [] }} />);
    expect(container.querySelectorAll('[data-testid="parsons-pool"] button[data-block-id]').length).toBe(3);
    fireEvent.click(container.querySelector('button[data-block-id="a"]')!);
    expect(onChange).toHaveBeenLastCalledWith({ type: 'parsons', lines: [{ id: 'a', indent: 0 }] });
    rerender(<Parsons {...base} question={question} onChange={onChange} value={{ type: 'parsons', lines: [{ id: 'a', indent: 0 }, { id: 'b', indent: 0 }] }} />);
    expect(container.querySelectorAll('[data-testid="parsons-pool"] button[data-block-id]').length).toBe(1);
    fireEvent.keyDown(container.querySelector('button[data-line-id="b"]')!, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ type: 'parsons', lines: [{ id: 'a', indent: 0 }, { id: 'b', indent: 1 }] });
    fireEvent.keyDown(container.querySelector('button[data-line-id="b"]')!, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith({ type: 'parsons', lines: [{ id: 'b', indent: 0 }, { id: 'a', indent: 0 }] });
  });

  it('find_and_fix: selecting a segment adds a correction input', () => {
    const question = q<Extract<PublicQuestion, { type: 'find_and_fix' }>>({ type: 'find_and_fix', segments: [{ id: 's1', text: 'SELECT' }, { id: 's2', text: 'FORM' }] });
    const onChange = vi.fn();
    const { container, rerender } = render(<FindAndFix {...base} question={question} onChange={onChange} value={{ type: 'find_and_fix', fixes: [] }} />);
    fireEvent.click(container.querySelector('[data-segment-id="s2"]')!);
    expect(onChange).toHaveBeenCalledWith({ type: 'find_and_fix', fixes: [{ segmentId: 's2', text: '' }] });
    rerender(<FindAndFix {...base} question={question} onChange={onChange} value={{ type: 'find_and_fix', fixes: [{ segmentId: 's2', text: '' }] }} />);
    expect(container.querySelectorAll('[data-testid="find-fix-inputs"] input').length).toBe(1);
  });

  it('regex_answer checks the examples live while typing and shows the model pattern after reveal', () => {
    const question = q<Extract<PublicQuestion, { type: 'regex_answer' }>>({ type: 'regex_answer', answer: { shouldMatch: ['abc'], shouldNotMatch: ['abd'], fullMatch: true } });
    const { container, rerender } = render(<RegexAnswer {...base} question={question} value={{ type: 'regex_answer', pattern: 'ab.' }} />);
    const rows = container.querySelectorAll('li');
    expect(rows[0]!.className).toContain('bg-ok-soft');
    expect(rows[1]!.className).toContain('bg-bad-soft');
    rerender(<RegexAnswer {...base} question={question} value={{ type: 'regex_answer', pattern: '(a+)+' }} />);
    expect(container.textContent).toContain('nested quantifiers');
    const grade = { isCorrect: true, gradable: true, detail: { parts: [{ id: 'match-1', correct: true }, { id: 'reject-1', correct: true }] } } as unknown as RendererProps['grade'];
    rerender(<RegexAnswer {...base} question={question} phase="revealed" grade={grade} answerKey={{ answer: { modelPattern: 'abc' } }} value={{ type: 'regex_answer', pattern: 'abc' }} />);
    expect(container.textContent).toContain('모범 패턴');
    expect(container.textContent).toContain('/abc/');
  });
});
