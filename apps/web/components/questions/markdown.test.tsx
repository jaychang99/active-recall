import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './markdown';

describe('Markdown renderer', () => {
  it('keeps inline answers valid inside a paragraph without nested block elements', () => {
    const { container } = render(<p>정답: <Markdown inline>{'**연결** 지향 $x^2$'}</Markdown></p>);
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('p div')).toBeNull();
    expect(container.querySelector('strong')?.textContent).toBe('연결');
    expect(container.querySelector('.katex')).not.toBeNull();
  });
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

  it('renders raw HTML (mark, details, rowspan table, inline svg) but strips scripts, handlers and iframes', () => {
    const html = '<p>중요: <mark>핵심</mark> <sup>2</sup></p><details open><summary>힌트</summary>숨긴 내용</details>' +
      '<table><tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr></table>' +
      '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4" fill="red" onclick="x()"/></svg>' +
      '<script>alert(1)</script><iframe src="https://evil"></iframe><img src="javascript:alert(1)"><a href="javascript:alert(2)" onclick="y()">x</a><span style="color:red">styled</span>';
    const { container } = render(<Markdown>{html}</Markdown>);
    expect(container.querySelector('mark')?.textContent).toBe('핵심');
    expect(container.querySelector('details summary')?.textContent).toBe('힌트');
    expect(container.querySelector('td')?.getAttribute('rowspan')).toBe('2');
    expect(container.querySelector('svg circle')).not.toBeNull();
    expect(container.querySelector('circle')?.getAttribute('onclick')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src') ?? '').not.toContain('javascript');
    expect(container.querySelector('a')?.getAttribute('href') ?? '').not.toContain('javascript');
    expect(container.querySelector('a')?.getAttribute('onclick')).toBeNull();
    expect((container.querySelector('span[style]') as HTMLElement | null)?.style.color).toBe('red');
  });
  it('still renders math and GFM next to raw HTML', () => {
    const { container } = render(<Markdown>{'<b>bold</b> and $x^2$ and ~~gone~~'}</Markdown>);
    expect(container.querySelector('b')?.textContent).toBe('bold');
    expect(container.querySelector('.katex')).not.toBeNull();
    expect(container.querySelector('del')?.textContent).toBe('gone');
  });
});
