import { describe, expect, it } from 'vitest';
import rich from '../../../examples/example-rich-cloze-batch.json';
import { extractClozeIds, gradeAnswer, toPublicQuestion, validateBatch, type Question } from '../src/index';

const byId = (id: string) => (rich.questions as Question[]).find((q) => q.id === id) as Question;

describe('cloze blanks inside tables and diagrams (prompt is free Markdown)', () => {
  it('the rich-cloze example validates (schema + semantics)', () => {
    const r = validateBatch(rich);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.summary?.byType.cloze).toBe(1);
    expect(r.summary?.byType.cloze_select).toBe(1);
  });
  it('placeholders are found inside GFM table cells and mermaid fences', () => {
    expect(extractClozeIds(byId('rich-q001').prompt)).toEqual(['b1', 'b2']);
    expect(extractClozeIds(byId('rich-q002').prompt)).toEqual(['s1', 's2']);
  });
  it('grades as usual and hides keys in the public projection', () => {
    expect(gradeAnswer(byId('rich-q001'), { type: 'cloze', blanks: { b1: 'Transport', b2: '패킷' } }).isCorrect).toBe(true);
    expect(gradeAnswer(byId('rich-q002'), { type: 'cloze_select', blanks: { s1: 'a', s2: 'b' } }).isCorrect).toBe(true);
    const pub = JSON.stringify(rich.questions.map((q) => toPublicQuestion(q as Question)));
    expect(pub).not.toContain('acceptedAnswers');
    expect(pub).not.toContain('answerOptionId');
    expect(pub).toContain('{{s1}}');
  });
});
