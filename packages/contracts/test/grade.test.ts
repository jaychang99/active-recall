import { describe, expect, it } from 'vitest';
import { gradeAnswer, normalizeText, splitCloze, toPublicQuestion, answerSignature, canonicalJson } from '../src/index';
import { validBatch } from './fixtures/invalid-batches';
import type { Question } from '../src/index';

const byId = (id: string) => validBatch.questions.find((q) => q.id === id) as Question;

describe('graders', () => {
  it('single choice', () => {
    const q = byId('net-q001');
    expect(gradeAnswer(q, { type: 'single_choice', choiceId: 'a' }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { type: 'single_choice', choiceId: 'b' }).isCorrect).toBe(false);
    expect(gradeAnswer(q, { type: 'single_choice', choiceId: null }).isCorrect).toBe(false);
  });

  it('multiple choice requires exact set; partial is detail only', () => {
    const q = byId('net-q002');
    expect(gradeAnswer(q, { type: 'multiple_choice', choiceIds: ['c', 'a'] }).isCorrect).toBe(true);
    const partial = gradeAnswer(q, { type: 'multiple_choice', choiceIds: ['a'] });
    expect(partial.isCorrect).toBe(false);
    expect(partial.detail.partialRatio).toBeCloseTo(0.75);
    expect(gradeAnswer(q, { type: 'multiple_choice', choiceIds: ['a', 'c', 'b'] }).isCorrect).toBe(false);
  });

  it('true/false', () => {
    const q = byId('net-q003');
    expect(gradeAnswer(q, { type: 'true_false', value: false }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { type: 'true_false', value: true }).isCorrect).toBe(false);
  });

  it('short answer applies normalization exactly, including Korean', () => {
    const q = byId('net-q004');
    expect(gradeAnswer(q, { type: 'short_answer', text: '  32  ' }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { type: 'short_answer', text: '32비트' }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { type: 'short_answer', text: '32   BITS' }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { type: 'short_answer', text: '３２' }).isCorrect).toBe(true); // full-width digits → NFKC
    expect(gradeAnswer(q, { type: 'short_answer', text: '32 bit' }).isCorrect).toBe(false); // not in accepted list; no fuzzy matching
    expect(gradeAnswer(q, { type: 'short_answer', text: '' }).isCorrect).toBe(false);
  });

  it('normalization options can be disabled', () => {
    expect(normalizeText('  Ab  C ', { caseFold: false })).toBe('Ab C');
    expect(normalizeText('  Ab  C ', { trim: false, collapseWhitespace: false, caseFold: false })).toBe('  Ab  C ');
  });

  it('essay is never auto-graded; self scores are clamped per rubric item', () => {
    const q = byId('net-q005');
    const r = gradeAnswer(q, { type: 'essay', text: 'my answer', selfScores: [3, 99, 2] });
    expect(r.isCorrect).toBeNull();
    expect(r.gradable).toBe(false);
    expect(r.detail.selfScore).toBe(3 + 4 + 2);
    expect(r.detail.maxScore).toBe(10);
  });

  it('cloze grades every blank', () => {
    const q = byId('net-q006');
    expect(gradeAnswer(q, { type: 'cloze', blanks: { b1: '4', b2: 'Connection' } }).isCorrect).toBe(true);
    const half = gradeAnswer(q, { type: 'cloze', blanks: { b1: '4', b2: 'nope' } });
    expect(half.isCorrect).toBe(false);
    expect(half.detail.partialRatio).toBe(0.5);
    expect(splitCloze(q.prompt).filter((s) => s.kind === 'blank').map((s) => (s as { id: string }).id)).toEqual(['b1', 'b2']);
  });

  it('ordering requires exact sequence', () => {
    const q = byId('net-q007');
    expect(gradeAnswer(q, { type: 'ordering', orderedIds: ['syn', 'synack', 'ack'] }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { type: 'ordering', orderedIds: ['synack', 'syn', 'ack'] }).isCorrect).toBe(false);
    expect(gradeAnswer(q, { type: 'ordering', orderedIds: ['syn', 'synack'] }).isCorrect).toBe(false);
  });

  it('matching requires every pair', () => {
    const q = byId('net-q008');
    expect(gradeAnswer(q, { type: 'matching', pairs: [{ leftId: 'dns', rightId: 'name' }, { leftId: 'dhcp', rightId: 'config' }, { leftId: 'arp', rightId: 'mapping' }] }).isCorrect).toBe(true);
    const r = gradeAnswer(q, { type: 'matching', pairs: [{ leftId: 'dns', rightId: 'config' }, { leftId: 'dhcp', rightId: 'name' }, { leftId: 'arp', rightId: 'mapping' }] });
    expect(r.isCorrect).toBe(false);
    expect(r.detail.parts?.filter((p) => p.correct).length).toBe(1);
  });

  it('public projection removes answer keys for every type', () => {
    for (const q of validBatch.questions) {
      const pub = toPublicQuestion(q) as Record<string, unknown>;
      const json = JSON.stringify(pub);
      if (q.type === 'cloze') expect(json).not.toContain('acceptedAnswers');
      else if (q.type === 'essay') { expect(json).not.toContain('modelAnswer'); expect(json).not.toContain('rubric'); }
      else expect(pub.answer).toBeUndefined();
    }
  });

  it('essay answer signature ignores the display-only modelAnswerSegments', () => {
    const q = byId('net-q005') as Extract<Question, { type: 'essay' }>;
    const without = { ...q, answer: { ...q.answer, modelAnswerSegments: undefined } };
    delete without.answer.modelAnswerSegments;
    expect(JSON.stringify(answerSignature(q))).toBe(JSON.stringify(answerSignature(without)));
    expect(JSON.stringify(answerSignature({ ...q, answer: { ...q.answer, maxScore: 12 } }))).not.toBe(JSON.stringify(answerSignature(q)));
  });

  it('answer signature ignores prompt typos but tracks answer edits', () => {
    const q = byId('net-q001') as Extract<Question, { type: 'single_choice' }>;
    const typo = { ...q, prompt: q.prompt + ' (수정)' };
    expect(canonicalJson(answerSignature(typo))).toBe(canonicalJson(answerSignature(q)));
    const changed = { ...q, answer: { choiceId: 'b' } };
    expect(canonicalJson(answerSignature(changed))).not.toBe(canonicalJson(answerSignature(q)));
  });
});
