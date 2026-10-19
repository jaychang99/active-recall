import { describe, expect, it } from 'vitest';
import extended from '../../../examples/example-extended-batch.json';
import example from '../../../examples/example-question-batch.json';
import { EXTENDED_QUESTION_TYPES, gradeAnswer, isObjectivelyGradable, toPublicQuestion, validateBatch, type Question } from '../src/index';

const byId = (id: string) => (extended.questions as Question[]).find((q) => q.id === id) as Question;

describe('extended question types (additive)', () => {
  it('the original 8-type example still validates unchanged', () => {
    expect(validateBatch(example).ok).toBe(true);
  });
  it('the extended example validates and covers all 8 new types', () => {
    const r = validateBatch(extended);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    for (const t of EXTENDED_QUESTION_TYPES) expect(r.summary?.byType[t]).toBe(1);
  });
  it('numeric: tolerance and relative tolerance', () => {
    const q = byId('ext-q001');
    expect(gradeAnswer(q, { type: 'numeric', value: 1048576 }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { type: 'numeric', value: 1048575 }).isCorrect).toBe(false);
    const rel = { ...(q as Extract<Question, { type: 'numeric' }>), answer: { value: 100, relativeTolerance: 0.05 } };
    expect(gradeAnswer(rel, { type: 'numeric', value: 104 }).isCorrect).toBe(true);
    expect(gradeAnswer(rel, { type: 'numeric', value: 106 }).isCorrect).toBe(false);
    expect(gradeAnswer(q, { type: 'numeric', value: null }).isCorrect).toBe(false);
  });
  it('cloze_select, statement_set, categorize, two_tier, highlight are exact-set graders with partial detail', () => {
    expect(gradeAnswer(byId('ext-q002'), { type: 'cloze_select', blanks: { s1: 'a', s2: 'b' } }).isCorrect).toBe(true);
    expect(gradeAnswer(byId('ext-q002'), { type: 'cloze_select', blanks: { s1: 'a', s2: 'a' } }).detail.partialRatio).toBe(0.5);
    expect(gradeAnswer(byId('ext-q003'), { type: 'statement_set', values: { t1: true, t2: false, t3: true, t4: false } }).isCorrect).toBe(true);
    expect(gradeAnswer(byId('ext-q003'), { type: 'statement_set', values: { t1: true, t2: true, t3: true, t4: false } }).isCorrect).toBe(false);
    expect(gradeAnswer(byId('ext-q004'), { type: 'categorize', assignments: { rr: 'pre', srtf: 'pre', mlfq: 'pre', fcfs: 'non', sjf: 'non' } }).isCorrect).toBe(true);
    const tt = gradeAnswer(byId('ext-q005'), { type: 'two_tier', choiceId: 'a', reasonId: 'r2' });
    expect(tt.isCorrect).toBe(false);
    expect(tt.detail.note).toContain('reasoning wrong');
    expect(gradeAnswer(byId('ext-q008'), { type: 'highlight', segmentIds: ['w9', 'w5'] }).isCorrect).toBe(true);
    expect(gradeAnswer(byId('ext-q008'), { type: 'highlight', segmentIds: ['w5'] }).isCorrect).toBe(false);
  });
  it('recall_card is self-checked unless acceptedAnswers exist; stepwise grades every step', () => {
    const rc = byId('ext-q006');
    expect(isObjectivelyGradable(rc)).toBe(false);
    expect(gradeAnswer(rc, { type: 'recall_card', selfCorrect: true })).toMatchObject({ isCorrect: true, gradable: false });
    expect(gradeAnswer(rc, { type: 'recall_card' }).isCorrect).toBeNull();
    const typed = { ...(rc as Extract<Question, { type: 'recall_card' }>), answer: { acceptedAnswers: ['문맥 교환', 'context switch'] } };
    expect(isObjectivelyGradable(typed)).toBe(true);
    expect(gradeAnswer(typed, { type: 'recall_card', text: 'Context Switch' }).isCorrect).toBe(true);
    const sw = gradeAnswer(byId('ext-q007'), { type: 'stepwise', answers: { st1: '7', st2: '10', st3: '17/3' } });
    expect(sw.isCorrect).toBe(true);
    expect(gradeAnswer(byId('ext-q007'), { type: 'stepwise', answers: { st1: '7', st2: '9', st3: '5.67' } }).detail.partialRatio).toBeCloseTo(2 / 3);
  });
  it('public projections hide every answer key of the new types', () => {
    for (const q of extended.questions as Question[]) {
      const json = JSON.stringify(toPublicQuestion(q));
      for (const leak of ['answerOptionId', '"value":true', '"value":false', 'categoryId', 'reasonId', 'acceptedAnswers', 'segmentIds', '"back"', '"tolerance"']) expect(json).not.toContain(leak);
    }
  });
  it('semantic rules catch bad references in the new types', () => {
    const bad = JSON.parse(JSON.stringify(extended)) as { questions: Record<string, unknown>[] };
    (bad.questions[1] as { blanks: { answerOptionId: string }[] }).blanks[0]!.answerOptionId = 'zzz';
    (bad.questions[3] as { items: { categoryId: string }[] }).items[0]!.categoryId = 'nope';
    (bad.questions[4] as { answer: { reasonId: string } }).answer.reasonId = 'r9';
    (bad.questions[7] as { answer: { segmentIds: string[] } }).answer.segmentIds = ['w1', 'zz'];
    const r = validateBatch(bad);
    expect(r.ok).toBe(false);
    const msgs = r.issues.map((i) => i.message).join('\n');
    expect(msgs).toContain('answerOptionId "zzz"');
    expect(msgs).toContain('categoryId "nope"');
    expect(msgs).toContain('reasonId "r9"');
    expect(msgs).toContain('segmentId "zz"');
  });
});
