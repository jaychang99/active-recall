import { describe, expect, it } from 'vitest';
import type { Question } from '@recall/contracts';
import type { CardInfo, Note } from './api';
import { buildQuestionExport, essayGradingPrompt, explainPrompt, exportJson, stripDataUris } from './question-export';

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

describe('essayGradingPrompt', () => {
  const essay = {
    id: 'e1',
    type: 'essay',
    prompt: 'TCP와 UDP의 차이를 서술하시오.',
    answer: {
      modelAnswer: 'TCP는 연결 지향이고 신뢰성을 보장한다. UDP는 비연결형이다.',
      maxScore: 5,
      rubric: [
        { criterion: '연결 방식', maxPoints: 2, guidance: '연결 지향/비연결 구분' },
        { criterion: '신뢰성', maxPoints: 3, guidance: '재전송·순서 보장 언급' },
      ],
      modelAnswerSegments: [{ text: 'TCP는 연결 지향이고', points: 2, rubricIndex: 0 }, { text: '신뢰성을 보장한다.', points: 3, rubricIndex: 1, note: '재전송' }],
    },
    explanation: { summary: '전송 계층' },
  } as unknown as Question;
  const doc = buildQuestionExport({ ...base, question: { id: 'cuid2', externalId: 'e1', type: 'essay', data: essay }, answerPayload: null, grade: null, revealedBeforeAnswer: true });

  it('puts the rubric, model answer, segments, my answer and self-score in front of the JSON', () => {
    const p = essayGradingPrompt(doc, '  TCP는 연결을 맺는다.  ', [1, 0]);
    expect(p).toContain('## 채점 기준 (총 5점)');
    expect(p).toContain('1. **연결 방식** (2점)');
    expect(p).toContain('채점 지침: 재전송·순서 보장 언급');
    expect(p).toContain('- TCP는 연결 지향이고 — 2점 (기준 1. 연결 방식)');
    expect(p).toContain('신뢰성을 보장한다. — 3점 (기준 2. 신뢰성) · 재전송');
    // the typed answer is kept even though the attempt was revealed (the export drops it)
    expect(doc.attempt.answerPayload).toBeNull();
    expect(p).toContain('```text\nTCP는 연결을 맺는다.\n```');
    expect(p).toContain('- 합계: 1 / 5');
    expect(p).toContain('`총점: X / 5`');
    expect(p.indexOf('## 내 답안')).toBeLessThan(p.indexOf('```json'));
  });

  it('falls back to the model answer when there is no rubric or self-score', () => {
    const bare = { ...essay, answer: { modelAnswer: '모범', maxScore: 10, rubric: [] } } as unknown as Question;
    const p = essayGradingPrompt(buildQuestionExport({ ...base, question: { id: 'c3', externalId: 'e2', type: 'essay', data: bare } }), '답');
    expect(p).toContain('따로 정해진 기준이 없습니다. 모범답안과 비교해 10점 만점으로 채점해 주세요.');
    expect(p).not.toContain('## 내 자기 채점');
    expect(p).not.toContain('문장별 배점');
  });
});
