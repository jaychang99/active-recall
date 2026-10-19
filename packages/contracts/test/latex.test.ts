import { describe, expect, it } from 'vitest';
import latex from '../../../examples/example-latex-batch.json';
import { validateBatch, gradeAnswer, splitCloze, type Question } from '../src/index';

describe('LaTeX example batch', () => {
  it('validates (schema + semantics) and keeps $...$ delimiters intact', () => {
    const r = validateBatch(latex);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    const json = JSON.stringify(latex);
    expect(json).toContain('\\\\frac');
    expect(json).toContain('$$');
  });
  it('cloze placeholders survive surrounding display math', () => {
    const q = (latex.questions as Question[]).find((x) => x.id === 'calc-q002') as Extract<Question, { type: 'cloze' }>;
    expect(splitCloze(q.prompt).filter((s) => s.kind === 'blank').map((s) => (s as { id: string }).id)).toEqual(['b1', 'b2']);
    expect(gradeAnswer(q, { type: 'cloze', blanks: { b1: '1/3', b2: 'n(n+1)/2' } }).isCorrect).toBe(true);
  });
});
