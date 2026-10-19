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

  it('renders a sanitized inline SVG block and strips scripts', () => {
    const { container } = render(<Markdown>{'```svg\n<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="5" height="5" onclick="x()"/></svg>\n```'}</Markdown>);
    expect(container.querySelector('[data-testid="svg-block"] svg rect')).not.toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('rect')?.getAttribute('onclick')).toBeNull();
  });
  it('highlights fenced code and keeps the copy button', () => {
    const { container } = render(<Markdown>{'```python\nprint("hi")\n```'}</Markdown>);
    expect(container.querySelector('code.hljs, code.language-python')).not.toBeNull();
    expect(container.querySelector('button[aria-label="코드 복사"]')).not.toBeNull();
  });
  it('allows data:image URLs but not javascript: URLs', () => {
    const { container } = render(<Markdown>{'![a](data:image/png;base64,iVBORw0KGgo=) [x](javascript:alert(1))'}</Markdown>);
    expect(container.querySelector('img')?.getAttribute('src')).toContain('data:image/png');
    expect(container.querySelector('a')?.getAttribute('href') ?? '').not.toContain('javascript:');
  });
  it('renders chemistry via mhchem', () => {
    const { container } = render(<Markdown>{'$\\ce{H2O}$'}</Markdown>);
    expect(container.querySelector('.katex')).not.toBeNull();
  });
});
