import { describe, expect, it } from 'vitest';
import type { Question } from '@recall/contracts';
import type { CardInfo, Note } from './api';
import { buildQuestionExport, explainPrompt, exportJson, stripDataUris } from './question-export';

const question = {
  id: 'q1',
  type: 'single_choice',
  prompt: '1 + 1 = ?',
  choices: [
    { id: 'a', text: '1', explanation: '하나 모자랍니다' },
    { id: 'b', text: '2', explanation: '맞습니다' },
  ],
  answer: { choiceId: 'b' },
  explanation: { summary: '덧셈' },
  source: { document: '산수 교과서', location: 'p.3' },
} as unknown as Question;

const card: CardInfo = { status: 'REVIEW', dueAt: '2026-10-21T00:00:00.000Z', version: 3, reps: 2, lapses: 1, stability: 4.2, difficulty: 5.1, flagged: false, suspended: false, lastReviewAt: null, retrievability: 0.9 };

const note = (round: number, body: string, review: Note['review'] = null): Note => ({ id: `n${round}`, questionId: 'q1', reviewRound: round, reviewLogId: null, body, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', review });

const base = {
  question: { id: 'cuid1', externalId: 'q1', type: 'single_choice', data: question },
  deck: { id: 'd1', title: '산수', subject: '수학' },
  subjects: ['수학', '기초'],
  card,
  reviewRound: 3,
  revealedBeforeAnswer: false,
  hintUsed: true,
  answerPayload: { type: 'single_choice', choiceId: 'a' } as const,
  grade: { isCorrect: false, gradable: true, detail: {} },
  notes: [note(1, '헷갈림', { id: 'r1', rating: 1, reviewedAt: '2026-10-01T00:00:00.000Z', isCorrect: false, undone: false }), note(2, '   ')],
  now: new Date('2026-10-20T12:00:00.000Z'),
};

describe('buildQuestionExport', () => {
  it('carries the full question, attempt, card and non-empty notes', () => {
    const e = buildQuestionExport(base);
    expect(e.question.data).toBe(question);
    expect(e.question.typeLabel).not.toBe('');
    expect(e.attempt).toMatchObject({ reviewRound: 3, hintUsed: true, answerPayload: { choiceId: 'a' }, grade: { isCorrect: false } });
    expect(e.notes).toEqual([{ reviewRound: 1, body: '헷갈림', updatedAt: '2026-10-01T00:00:00.000Z', review: { rating: 'Again', reviewedAt: '2026-10-01T00:00:00.000Z', isCorrect: false } }]);
    expect(JSON.parse(exportJson(e)).exportedAt).toBe('2026-10-20T12:00:00.000Z');
  });

  it('drops the grade when the answer was revealed without answering', () => {
    const e = buildQuestionExport({ ...base, revealedBeforeAnswer: true });
    expect(e.attempt.grade).toBeNull();
    expect(e.attempt.answerPayload).toBeNull();
  });
});

describe('explainPrompt', () => {
  it('wraps the JSON in an explanation request and points out a wrong answer', () => {
    const p = explainPrompt(buildQuestionExport(base));
    expect(p).toContain('자세한 해설');
    expect(p).toContain('틀렸습니다');
    // the last request: a plain-text note the learner can paste into the question's 메모
    expect(p).toContain("8. **메모**");
    expect(p).toContain('plain text');
    expect(p).toContain('```text');
    const json = p.slice(p.indexOf('```json') + 7, p.lastIndexOf('```'));
    expect(JSON.parse(json).question.data.source.document).toBe('산수 교과서');
  });
});

describe('stripDataUris', () => {
  it('replaces long base64 images and keeps everything else', () => {
    const big = `data:image/png;base64,${'A'.repeat(4000)}`;
    const out = stripDataUris({ image: { url: big, alt: '그림' }, list: ['https://x/y.png', 'data:image/png;base64,AA'] });
    expect(out.image.url).toMatch(/^\[image\/png 이미지 데이터 생략/);
    expect(out.image.alt).toBe('그림');
    expect(out.list).toEqual(['https://x/y.png', 'data:image/png;base64,AA']);
  });
});
