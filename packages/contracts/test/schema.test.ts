import { describe, expect, it } from 'vitest';
import { validateBatch, validateBatchSchema, parseBatchJson, IMPORT_LIMITS } from '../src/index';
import { clone, invalidFixtures, validBatch } from './fixtures/invalid-batches';

describe('question-batch schema', () => {
  it('accepts the 8-type example fixture (schema + semantics)', () => {
    const r = validateBatch(clone(validBatch));
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.summary?.total).toBe(8);
    expect(Object.values(r.summary!.byType).every((n) => n === 1)).toBe(true);
  });

  for (const f of invalidFixtures) {
    it(`rejects: ${f.name}`, () => {
      const r = validateBatch(f.mutate(clone(validBatch)));
      expect(r.ok).toBe(false);
      expect(r.issues.length).toBeGreaterThan(0);
      expect(r.issues.map((i) => i.message).join('\n')).toContain(f.expect);
    });
  }

  it('points issues at the question index and id', () => {
    const b = clone(validBatch);
    (b.questions[3] as { answer: unknown }).answer = { acceptedAnswers: [] };
    const r = validateBatchSchema(b);
    expect(r.ok).toBe(false);
    const issue = r.issues.find((i) => i.questionIndex === 3);
    expect(issue?.questionId).toBe('net-q004');
    expect(issue?.path).toBe('/questions/3/answer/acceptedAnswers');
  });

  it('rejects non-object and prototype keys when parsing', () => {
    expect(parseBatchJson('[]').ok).toBe(false);
    expect(parseBatchJson('{"__proto__": {"x": 1}}').ok).toBe(false);
    expect(parseBatchJson('{"a": ').ok).toBe(false);
    expect(parseBatchJson('{"a": 1}').ok).toBe(true);
  });

  it('enforces the question count limit', () => {
    const b = clone(validBatch);
    const q0 = b.questions[0]!;
    b.questions = Array.from({ length: IMPORT_LIMITS.maxQuestions + 1 }, (_, i) => ({ ...clone(q0), id: `q${i}` }));
    const r = validateBatch(b);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === 'limit')).toBe(true);
  });
});
