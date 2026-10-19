import type { Normalization } from './types';

export const DEFAULT_NORMALIZATION: Required<Normalization> = {
  trim: true,
  unicodeNfkc: true,
  collapseWhitespace: true,
  caseFold: true,
};

/** Apply the schema's textual normalization options (defaults all true). No semantic matching. */
export function normalizeText(text: string, options?: Normalization): string {
  const o = { ...DEFAULT_NORMALIZATION, ...(options ?? {}) };
  let s = text;
  if (o.unicodeNfkc) s = s.normalize('NFKC');
  if (o.collapseWhitespace) s = s.replace(/\s+/g, ' ');
  if (o.trim) s = s.trim();
  if (o.caseFold) s = s.toLocaleLowerCase();
  return s;
}

export function matchesAccepted(given: string, accepted: string[], options?: Normalization): boolean {
  const g = normalizeText(given, options);
  if (g.length === 0) return false;
  return accepted.some((a) => normalizeText(a, options) === g);
}

const CLOZE_RE = /\{\{\s*([A-Za-z0-9][A-Za-z0-9_-]{0,79})\s*\}\}/g;

/** Extract `{{id}}` placeholders in order of appearance (duplicates preserved). */
export function extractClozeIds(prompt: string): string[] {
  const ids: string[] = [];
  for (const m of prompt.matchAll(CLOZE_RE)) ids.push(m[1]!);
  return ids;
}

/** Split a cloze prompt into text / blank segments for rendering. */
export function splitCloze(prompt: string): ({ kind: 'text'; text: string } | { kind: 'blank'; id: string })[] {
  const out: ({ kind: 'text'; text: string } | { kind: 'blank'; id: string })[] = [];
  let last = 0;
  for (const m of prompt.matchAll(CLOZE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: 'text', text: prompt.slice(last, idx) });
    out.push({ kind: 'blank', id: m[1]! });
    last = idx + m[0].length;
  }
  if (last < prompt.length) out.push({ kind: 'text', text: prompt.slice(last) });
  return out;
}
