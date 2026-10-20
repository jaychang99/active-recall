import { createContext, useContext, type ReactNode } from 'react';
import { extractClozeIds, splitCloze } from '@recall/contracts';

/**
 * Cloze support for the shared Markdown renderer.
 *
 * The prompt is rendered as ONE Markdown document (so GFM tables, HTML tables, lists, diagrams… stay intact) and the
 * `{{id}}` placeholders are turned into `<span data-cloze-id="…">` elements by a rehype plugin that runs AFTER
 * rehype-sanitize. The `span` component of the renderer then draws the input / select supplied through
 * {@link ClozeContext}. Placeholders inside `code`/`pre` (fenced + inline code) and inside math are left untouched;
 * ```mermaid / ```svg fences are handled by the `pre` component (numbered labels in the drawing + inputs below it).
 */
export interface ClozeRenderConfig {
  /** Blank ids in authored order (= numbering of ①②③ labels for blanks inside diagrams). */
  ids: string[];
  /** Renders the interactive control (input / select / revealed badge) for a blank. */
  render: (id: string) => ReactNode;
}

export const ClozeContext = createContext<ClozeRenderConfig | null>(null);
export const useClozeConfig = () => useContext(ClozeContext);

/** ①…⑳ then (21), (22)… */
export function circledLabel(index: number): string {
  if (index < 0) return '?';
  if (index < 20) return String.fromCodePoint(0x2460 + index);
  return `(${index + 1})`;
}

/** Replace `{{id}}` inside diagram source with its circled label; returns the ids found (deduplicated, in order). */
export function labelDiagramBlanks(code: string, ids: string[]): { code: string; found: string[] } {
  const found: string[] = [];
  const out = splitCloze(code)
    .map((s) => {
      if (s.kind === 'text') return s.text;
      if (!found.includes(s.id)) found.push(s.id);
      return circledLabel(ids.indexOf(s.id));
    })
    .join('');
  return { code: out, found };
}

export const hasClozePlaceholder = (text: string) => extractClozeIds(text).length > 0;

// --- rehype plugin -------------------------------------------------------------------------------------------------

// Minimal structural hast types (avoids a direct dependency on @types/hast).
interface HastText { type: 'text'; value: string }
interface HastElement { type: 'element'; tagName: string; properties?: Record<string, unknown>; children: HastNode[] }
interface HastParent { type: string; children: HastNode[] }
type HastNode = HastText | HastElement | HastParent | { type: string };

const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style', 'textarea']);

function isSkipped(el: HastElement): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  const cls = el.properties?.className;
  const list = Array.isArray(cls) ? cls.map(String) : typeof cls === 'string' ? cls.split(/\s+/) : [];
  return list.includes('math');
}

function blankElement(id: string): HastElement {
  return { type: 'element', tagName: 'span', properties: { dataClozeId: id }, children: [] };
}

function walk(node: HastNode): void {
  if (!('children' in node) || !Array.isArray(node.children)) return;
  if (node.type === 'element' && isSkipped(node as HastElement)) return;
  const next: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && hasClozePlaceholder((child as HastText).value)) {
      for (const seg of splitCloze((child as HastText).value)) next.push(seg.kind === 'text' ? { type: 'text', value: seg.text } : blankElement(seg.id));
    } else {
      walk(child);
      next.push(child);
    }
  }
  node.children = next;
}

/** rehype plugin: `{{id}}` text → `<span data-cloze-id="id"></span>` (outside code / math). */
export function rehypeClozeBlanks() {
  return (tree: HastNode) => {
    walk(tree);
  };
}
