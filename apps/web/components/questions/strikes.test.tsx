import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicQuestion } from '@recall/contracts';
import { ClozeBank } from './cloze-bank';
import { Highlight } from './highlight';
import { Matching } from './matching';
import { MultipleChoice } from './multiple-choice';
import { Parsons } from './parsons';
import { SingleChoice } from './single-choice';
import { resetStrikesForTest } from './strikes';
import { TwoTier } from './two-tier';

vi.mock('./rich-blocks', () => ({ MermaidBlock: () => null, SvgBlock: () => null }));

const base = { value: null, onChange: () => {}, onSubmit: () => {}, phase: 'answering' as const, grade: null, answerKey: null, shuffleSeed: null, showKeyHints: false };
const q = <T,>(o: Record<string, unknown>) => ({ id: 'q1', prompt: 'p', difficulty: 1, tags: [], ...o }) as unknown as T;
const choices = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }];
const single = q<Extract<PublicQuestion, { type: 'single_choice' }>>({ type: 'single_choice', choices });
const row = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-choice-id="${id}"]`)!;
const strikeBtn = (c: HTMLElement, id: string) => row(c, id).parentElement!.querySelector<HTMLElement>('[data-strike-toggle]')!;

afterEach(() => act(() => resetStrikesForTest()));

describe('elimination marks (view-only strike-through)', () => {
  it('single_choice: the toggle strikes an option without touching the answer; choosing it clears the mark', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<SingleChoice {...base} question={single} onChange={onChange} />);
    fireEvent.click(strikeBtn(container, 'b'));
    expect(onChange).not.toHaveBeenCalled();
    expect(row(container, 'b').dataset.struck).toBe('true');
    expect(strikeBtn(container, 'b').getAttribute('aria-pressed')).toBe('true');
    fireEvent.contextMenu(row(container, 'c')); // right-click also strikes
    expect(row(container, 'c').dataset.struck).toBe('true');
    fireEvent.click(strikeBtn(container, 'c'));
    expect(row(container, 'c').dataset.struck).toBeUndefined();

    fireEvent.click(row(container, 'b'));
    expect(onChange).toHaveBeenCalledWith({ type: 'single_choice', choiceId: 'b' });
    rerender(<SingleChoice {...base} question={single} onChange={onChange} value={{ type: 'single_choice', choiceId: 'b' }} />);
    expect(row(container, 'b').dataset.struck).toBeUndefined();
    rerender(<SingleChoice {...base} question={single} onChange={onChange} value={{ type: 'single_choice', choiceId: 'a' }} />);
    expect(row(container, 'b').dataset.struck).toBeUndefined(); // the mark is gone, not just hidden
  });

  it('marks survive a remount (moving between cards) but are dropped once the card is revealed', () => {
    const first = render(<SingleChoice {...base} question={single} />);
    fireEvent.click(strikeBtn(first.container, 'a'));
    first.unmount();
    const again = render(<SingleChoice {...base} question={single} />);
    expect(row(again.container, 'a').dataset.struck).toBe('true');
    again.rerender(<SingleChoice {...base} question={single} phase="revealed" answerKey={{ answer: { choiceId: 'b' } }} />);
    expect(again.container.querySelector('[data-strike-toggle]')).toBeNull();
    again.rerender(<SingleChoice {...base} question={single} />);
    expect(row(again.container, 'a').dataset.struck).toBeUndefined();
  });

  it('read-only replays show no toggles and do not clear live marks', () => {
    const live = render(<SingleChoice {...base} question={single} />);
    fireEvent.click(strikeBtn(live.container, 'a'));
    const replay = render(<SingleChoice {...base} question={single} phase="submitted" readOnly />);
    expect(replay.container.querySelector('[data-strike-toggle]')).toBeNull();
    expect(row(live.container, 'a').dataset.struck).toBe('true');
  });

  it('a different shuffle seed (next review round) starts clean', () => {
    const r = render(<SingleChoice {...base} question={single} shuffleSeed="1" />);
    fireEvent.click(strikeBtn(r.container, 'a'));
    r.rerender(<SingleChoice {...base} question={single} shuffleSeed="2" />);
    expect(row(r.container, 'a').dataset.struck).toBeUndefined();
  });

  it('multiple_choice and two_tier: each list keeps its own marks', () => {
    const mc = render(<MultipleChoice {...base} question={q<Extract<PublicQuestion, { type: 'multiple_choice' }>>({ type: 'multiple_choice', choices })} />);
    fireEvent.click(strikeBtn(mc.container, 'c'));
    expect(row(mc.container, 'c').dataset.struck).toBe('true');
    mc.unmount();

    const tt = q<Extract<PublicQuestion, { type: 'two_tier' }>>({ id: 'q2', type: 'two_tier', choices: [{ id: 'a', text: 'yes' }, { id: 'b', text: 'no' }], reasons: [{ id: 'a', text: 'r1' }, { id: 'b', text: 'r2' }] });
    const { container } = render(<TwoTier {...base} question={tt} />);
    const [choiceList, reasonList] = container.querySelectorAll<HTMLElement>('[data-testid="choice-list"]');
    fireEvent.click(reasonList!.querySelector<HTMLElement>('[data-choice-id="a"]')!.parentElement!.querySelector('[data-strike-toggle]')!);
    expect(reasonList!.querySelector<HTMLElement>('[data-choice-id="a"]')!.dataset.struck).toBe('true');
    expect(choiceList!.querySelector<HTMLElement>('[data-choice-id="a"]')!.dataset.struck).toBeUndefined();
  });

  it('matching: right-hand items strike from the reference list and the dropdown says so', () => {
    const question = q<Extract<PublicQuestion, { type: 'matching' }>>({ type: 'matching', left: [{ id: 'l1', text: 'L1' }], right: [{ id: 'r1', text: 'R1' }, { id: 'r2', text: 'R2' }] });
    const { container } = render(<Matching {...base} question={question} />);
    fireEvent.click(container.querySelector('[data-right-id="r2"]')!);
    expect(container.querySelector<HTMLElement>('[data-right-id="r2"]')!.dataset.struck).toBe('true');
    expect([...container.querySelectorAll('option')].map((o) => o.textContent)).toContain('B. R2 (지움)');
  });

  it('cloze_bank: unused bank chips strike on click; used chips stay as they are', () => {
    const question = q<Extract<PublicQuestion, { type: 'cloze_bank' }>>({ type: 'cloze_bank', prompt: 'A {{b1}}', bank: [{ id: 'k1', text: 'one' }, { id: 'k2', text: 'two' }], blanks: [{ id: 'b1' }] });
    const { container } = render(<ClozeBank {...base} question={question} value={{ type: 'cloze_bank', blanks: { b1: 'k1' } }} />);
    const chips = container.querySelectorAll<HTMLElement>('[data-testid="cloze-bank"] li');
    expect(chips[0]!.querySelector('button')).toBeNull();
    fireEvent.click(chips[1]!.querySelector('button')!);
    expect(container.querySelectorAll<HTMLElement>('[data-testid="cloze-bank"] li')[1]!.dataset.struck).toBe('true');
  });

  it('highlight: strike mode marks segments instead of selecting them', () => {
    const onChange = vi.fn();
    const question = q<Extract<PublicQuestion, { type: 'highlight' }>>({ type: 'highlight', segments: [{ id: 's1', text: 'one' }, { id: 's2', text: 'two' }] });
    const { container } = render(<Highlight {...base} question={question} onChange={onChange} />);
    fireEvent.click(container.querySelector('[data-testid="strike-mode"]')!);
    fireEvent.click(container.querySelector('[data-segment-id="s1"]')!);
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLElement>('[data-segment-id="s1"]')!.dataset.struck).toBe('true');
    expect(container.textContent).toContain('지운 표시 1개 모두 해제');
  });

  it('parsons: a struck pool block loses its mark when added to the solution', () => {
    const onChange = vi.fn();
    const question = q<Extract<PublicQuestion, { type: 'parsons' }>>({ type: 'parsons', blocks: [{ id: 'x', code: 'a = 1' }, { id: 'y', code: 'b = 2' }] });
    const { container } = render(<Parsons {...base} question={question} onChange={onChange} />);
    const li = () => container.querySelector<HTMLElement>('[data-block-id="x"]')!.closest('li')!;
    fireEvent.click(li().querySelector('[data-strike-toggle]')!);
    expect(li().dataset.struck).toBe('true');
    fireEvent.click(container.querySelector('[data-block-id="x"]')!);
    expect(onChange).toHaveBeenCalledWith({ type: 'parsons', lines: [{ id: 'x', indent: 0 }] });
    expect(li().dataset.struck).toBeUndefined();
  });
});
