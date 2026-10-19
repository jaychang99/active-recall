import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './markdown';

describe('Markdown renderer', () => {
  it('does not turn a single ~ into strikethrough', () => {
    const { container } = render(<Markdown>{'1~5번 문항과 오늘~내일 사이, 그리고 a ~ b ~ c'}</Markdown>);
    expect(container.querySelector('del')).toBeNull();
    expect(container.textContent).toContain('1~5번');
    expect(container.textContent).toContain('a ~ b ~ c');
  });
  it('still supports ~~double tilde~~ strikethrough and KaTeX', () => {
    const { container } = render(<Markdown>{'~~취소~~ 그리고 $x^2$'}</Markdown>);
    expect(container.querySelector('del')?.textContent).toBe('취소');
    expect(container.querySelector('.katex')).not.toBeNull();
  });
});
