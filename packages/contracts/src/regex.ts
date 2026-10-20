/**
 * Safety guard for learner-/author-supplied regular expressions (regex_answer).
 * The grader runs the pattern on the server, so we refuse anything that could take super-linear time:
 *  - patterns longer than MAX_PATTERN_LENGTH
 *  - a quantified group that itself contains a quantifier (`(a+)+`, `(?:x*y)*`, `(a|aa)+` …) — the classic ReDoS shape
 *  - back-references (`\1`), which make matching NP-hard in general
 * Test strings are capped by the schema (≤ 200 chars), so a pattern that passes this guard runs in trivial time.
 */
export const MAX_PATTERN_LENGTH = 200;
export const REGEX_FLAGS = /^[ims]{0,3}$/;

export interface RegexCheck {
  ok: boolean;
  reason?: string;
}

const QUANT_AFTER = /^(?:[*+?]|\{\d+(?:,\d*)?\})/;

/** Static analysis only — never compiles untrusted input before it passed. */
export function checkRegexSafety(pattern: string): RegexCheck {
  if (typeof pattern !== 'string' || pattern.length === 0) return { ok: false, reason: 'empty pattern' };
  if (pattern.length > MAX_PATTERN_LENGTH) return { ok: false, reason: `pattern longer than ${MAX_PATTERN_LENGTH} characters` };
  if (/\\[1-9]/.test(pattern.replace(/\[(?:\\.|[^\]])*\]/g, ''))) return { ok: false, reason: 'back-references are not allowed' };
  // Walk the pattern tracking group nesting; remember whether a quantifier occurred inside each open group.
  const stack: { hasQuantifier: boolean }[] = [];
  let i = 0;
  let inClass = false;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === '\\') { i += 2; continue; }
    if (inClass) { if (ch === ']') inClass = false; i++; continue; }
    if (ch === '[') { inClass = true; i++; continue; }
    if (ch === '(') { stack.push({ hasQuantifier: false }); i++; continue; }
    if (ch === ')') {
      const closed = stack.pop();
      i++;
      const q = QUANT_AFTER.exec(pattern.slice(i));
      if (q) {
        if (closed?.hasQuantifier) return { ok: false, reason: 'nested quantifiers (e.g. (a+)+) are not allowed' };
        for (const s of stack) s.hasQuantifier = true;
        i += q[0].length;
        if (pattern[i] === '?') i++;
      }
      continue;
    }
    const q = QUANT_AFTER.exec(pattern.slice(i));
    if (q) {
      for (const s of stack) s.hasQuantifier = true;
      i += q[0].length;
      if (pattern[i] === '?') i++;
      continue;
    }
    i++;
  }
  return { ok: true };
}

export interface CompiledRegex {
  re: RegExp | null;
  error?: string;
}

/** Compile after the safety check; `fullMatch` wraps the pattern in ^(?:…)$. Never throws. */
export function compileSafeRegex(pattern: string, flags = '', fullMatch = false): CompiledRegex {
  const safety = checkRegexSafety(pattern);
  if (!safety.ok) return { re: null, error: safety.reason };
  if (!REGEX_FLAGS.test(flags)) return { re: null, error: 'flags must be a subset of i, m, s' };
  try {
    return { re: new RegExp(fullMatch ? `^(?:${pattern})$` : pattern, flags) };
  } catch (e) {
    return { re: null, error: (e as Error).message };
  }
}

export interface RegexExampleResult {
  id: string;
  text: string;
  expected: boolean;
  matched: boolean | null;
  correct: boolean;
}

/** Run a compiled (or failed) pattern over the positive/negative examples. */
export function testRegexExamples(compiled: CompiledRegex, shouldMatch: string[], shouldNotMatch: string[]): RegexExampleResult[] {
  const run = (text: string) => {
    if (!compiled.re) return null;
    compiled.re.lastIndex = 0;
    return compiled.re.test(text);
  };
  return [
    ...shouldMatch.map((text, i) => { const m = run(text); return { id: `match-${i + 1}`, text, expected: true, matched: m, correct: m === true }; }),
    ...shouldNotMatch.map((text, i) => { const m = run(text); return { id: `reject-${i + 1}`, text, expected: false, matched: m, correct: m === false }; }),
  ];
}
