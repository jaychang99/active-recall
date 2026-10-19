'use client';
import { Check, Copy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { sanitizeSchema } from './sanitize-schema';
import 'katex/contrib/mhchem';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { cn, copyToClipboard } from '@/lib/utils';
import { MermaidBlock, SvgBlock } from './rich-blocks';

const RICH_LANGS = new Set(['mermaid', 'svg']);

/** Allow http(s), mailto, relative and data:image URLs (react-markdown blocks data: by default). */
function urlTransform(url: string): string {
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/i.test(url)) return url;
  if (/^(https?:|mailto:|#|\/|\.)/i.test(url)) return url;
  return '';
}

/** Markdown (GFM + KaTeX + raw HTML). Raw HTML is parsed (rehype-raw) and then sanitized against an allowlist
 *  (rehype-sanitize, see sanitize-schema.ts) BEFORE KaTeX/highlighting add their own markup. */
export function Markdown({ children, className, inline }: { children: string; className?: string; inline?: boolean }) {
  return (
    <div className={cn(inline ? 'prose-q inline [&>p]:inline' : 'prose-q', className)}>
      <ReactMarkdown
        // singleTilde: false → only ~~text~~ is strikethrough; a lone "~" (범위 표기 1~5, 오늘~내일) stays literal.
        remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkMath]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], [rehypeKatex, { throwOnError: false, strict: 'ignore' }], [rehypeHighlight, { detect: false, ignoreMissing: true, plainText: ['mermaid', 'svg', 'text', 'txt'] }]]}
        urlTransform={urlTransform}
        components={{
          pre: ({ children }) => {
            // ```mermaid / ```svg fences become diagrams; everything else is a copyable code block
            const child = Array.isArray(children) ? children[0] : children;
            const props = child && typeof child === 'object' && 'props' in child ? (child as { props: { className?: string; children?: ReactNode } }).props : null;
            const lang = /language-([\w-]+)/.exec(props?.className ?? '')?.[1]?.toLowerCase();
            if (lang && RICH_LANGS.has(lang)) {
              const code = extractText(props?.children);
              return lang === 'mermaid' ? <MermaidBlock code={code} /> : <SvgBlock code={code} />;
            }
            return <CodeBlock>{children}</CodeBlock>;
          },
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary external/data URLs from question content cannot go through next/image
          img: ({ src, alt }) => (src ? <img src={typeof src === 'string' ? src : undefined} alt={alt ?? ''} loading="lazy" className="my-2 h-auto max-w-full rounded-md border border-line" /> : null),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = extractText(children);
  return (
    <pre>
      <button
        type="button"
        onClick={async () => {
          if (await copyToClipboard(text)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        aria-label="코드 복사"
        className="absolute right-2 top-2 rounded border border-line bg-elevated p-1 text-ink-3 opacity-70 hover:opacity-100"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {children}
    </pre>
  );
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) return extractText((node as { props: { children?: ReactNode } }).props.children);
  return '';
}
