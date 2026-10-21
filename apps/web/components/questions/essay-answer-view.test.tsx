import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ModelAnswerSegment, RubricItem } from '@recall/contracts';
import { EssayModelAnswer, segmentPointsByCriterion } from './essay-answer-view';

const rubric: RubricItem[] = [{ criterion: '연결 방식', maxPoints: 3, guidance: 'g' }, { criterion: '구성', maxPoints: 2, guidance: 'g' }];
const segments: ModelAnswerSegment[] = [
  { text: 'TCP는 연결 지향이며 ', points: 2, rubricIndex: 0, note: '연결 지향' },
  { text: '$O(n)$ 이다.\n\n' },
  { text: 'UDP는 비연결형이다.', points: 1, rubricIndex: 0 },
];
const modelAnswer = 'TCP는 연결 지향이며 $O(n)$ 이다.\n\nUDP는 비연결형이다.';

describe('EssayModelAnswer', () => {
  it('scored view marks each scored sentence with its points and rubric number, keeping spaces and math', () => {
    const { container } = render(<EssayModelAnswer modelAnswer={modelAnswer} segments={segments} rubric={rubric} view="scored" onViewChange={() => {}} />);
    const scored = [...container.querySelectorAll('[data-segment-points]')];
    expect(scored.map((e) => e.getAttribute('data-segment-points'))).toEqual(['2', '1']);
    expect(scored[0]!.textContent).toContain('+2점①');
    expect(scored[0]!.getAttribute('title')).toBe('+2점 · ① 연결 방식 — 연결 지향');
    expect(container.querySelector('[data-testid="essay-scored-answer"]')!.textContent).toMatch(/연결 지향이며\+2점① O\(n\)/);
    expect(container.querySelector('.katex')).not.toBeNull();
    expect(container.querySelector('[data-testid="essay-model-answer"]')!.getAttribute('data-view')).toBe('scored');
  });

  it('falls back to the plain text and says so when the question has no segments (older data)', () => {
    const { container, getByTestId } = render(<EssayModelAnswer modelAnswer={modelAnswer} rubric={rubric} view="scored" onViewChange={() => {}} />);
    expect(getByTestId('essay-scored-unsupported')).toBeInTheDocument();
    expect(container.querySelector('[data-segment-points]')).toBeNull();
    expect(getByTestId('essay-view-switch').textContent).toContain('미지원');
    expect(container.querySelector('[data-testid="essay-model-answer"]')!.getAttribute('data-view')).toBe('plain');
  });

  it('plain view shows the text; the switch reports the chosen view', () => {
    const onViewChange = vi.fn();
    const { container, getByTestId } = render(<EssayModelAnswer modelAnswer={modelAnswer} segments={segments} rubric={rubric} view="plain" onViewChange={onViewChange} />);
    expect(container.querySelector('[data-segment-points]')).toBeNull();
    fireEvent.click(getByTestId('essay-view-switch').querySelector('[data-view="scored"]')!);
    expect(onViewChange).toHaveBeenCalledWith('scored');
  });

  it('sums segment points per rubric criterion', () => {
    expect([...segmentPointsByCriterion(segments)]).toEqual([[0, 3]]);
  });
});
