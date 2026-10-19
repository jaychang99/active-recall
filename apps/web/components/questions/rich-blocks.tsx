'use client';
import DOMPurify from 'dompurify';
import { useTheme } from 'next-themes';
import { useEffect, useId, useRef, useState } from 'react';

/** ```mermaid fenced block → rendered diagram (lazy-loads mermaid; strict security level; follows the theme). */
export function MermaidBlock({ code }: { code: string }) {
  const { resolvedTheme } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: resolvedTheme === 'dark' ? 'dark' : 'neutral', fontFamily: 'inherit' });
        const { svg } = await mermaid.render(`m${id}${resolvedTheme === 'dark' ? 'd' : 'l'}`, code.trim());
        if (!cancelled && ref.current) {
          ref.current.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['foreignObject'], ADD_ATTR: ['dominant-baseline', 'marker-end', 'marker-start'] });
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [code, id, resolvedTheme]);
  return (
    <figure className="my-2 overflow-x-auto rounded-md border border-line bg-elevated p-3" data-testid="mermaid-block">
      {error ? <pre className="text-[12px] text-bad-ink">Mermaid 오류: {error}</pre> : null}
      <div ref={ref} className="[&>svg]:mx-auto [&>svg]:max-w-full" aria-label="다이어그램" />
    </figure>
  );
}

/** ```svg fenced block → sanitized inline SVG (no scripts, no external references). */
export function SvgBlock({ code }: { code: string }) {
  const clean = DOMPurify.sanitize(code, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['script', 'foreignObject'], FORBID_ATTR: ['onload', 'onclick', 'href', 'xlink:href'] });
  return <figure className="my-2 overflow-x-auto rounded-md border border-line bg-elevated p-3 [&>svg]:mx-auto [&>svg]:h-auto [&>svg]:max-w-full" data-testid="svg-block" dangerouslySetInnerHTML={{ __html: clean }} />;
}
