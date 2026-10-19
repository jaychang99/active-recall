import { matchesAccepted } from './normalize';
import type { AnswerPayload, GradeResult, Question } from './types';

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x)) && s.size === a.length;
}

/**
 * Authoritative grader. Returns `isCorrect: null` when the question is not objectively
 * gradable (essay) — the learner self-assesses with the rubric instead.
 * Partial credit is reported in `detail` only; it never flips `isCorrect` to true.
 */
export function gradeAnswer(question: Question, payload: AnswerPayload | null | undefined): GradeResult {
  if (!payload || payload.type !== question.type) {
    return { isCorrect: question.type === 'essay' ? null : false, gradable: question.type !== 'essay', detail: { note: 'no answer submitted' } };
  }
  switch (question.type) {
    case 'single_choice': {
      const p = payload as Extract<AnswerPayload, { type: 'single_choice' }>;
      const correct = p.choiceId === question.answer.choiceId;
      return {
        isCorrect: correct,
        gradable: true,
        detail: { parts: [{ id: question.answer.choiceId, correct, expected: question.answer.choiceId, given: p.choiceId }] },
      };
    }
    case 'multiple_choice': {
      const p = payload as Extract<AnswerPayload, { type: 'multiple_choice' }>;
      const expected = question.answer.choiceIds;
      const given = [...new Set(p.choiceIds)];
      const parts = question.choices.map((c) => ({
        id: c.id,
        correct: expected.includes(c.id) === given.includes(c.id),
        expected: expected.includes(c.id) ? 'selected' : 'not-selected',
        given: given.includes(c.id) ? 'selected' : 'not-selected',
      }));
      return {
        isCorrect: sameSet(expected, given),
        gradable: true,
        detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length },
      };
    }
    case 'true_false': {
      const p = payload as Extract<AnswerPayload, { type: 'true_false' }>;
      const correct = p.value === question.answer.value;
      return { isCorrect: correct, gradable: true, detail: { parts: [{ id: 'value', correct, expected: String(question.answer.value), given: p.value === null ? null : String(p.value) }] } };
    }
    case 'short_answer': {
      const p = payload as Extract<AnswerPayload, { type: 'short_answer' }>;
      const correct = matchesAccepted(p.text ?? '', question.answer.acceptedAnswers, question.answer.normalization);
      return { isCorrect: correct, gradable: true, detail: { parts: [{ id: 'text', correct, expected: question.answer.acceptedAnswers, given: p.text }] } };
    }
    case 'essay': {
      const p = payload as Extract<AnswerPayload, { type: 'essay' }>;
      const max = question.answer.maxScore;
      let selfScore: number | undefined;
      if (Array.isArray(p.selfScores) && p.selfScores.length === question.answer.rubric.length) {
        selfScore = p.selfScores.reduce((s, v, i) => s + Math.max(0, Math.min(question.answer.rubric[i]!.maxPoints, Number(v) || 0)), 0);
      }
      return { isCorrect: null, gradable: false, detail: { selfScore, maxScore: max, note: 'manual self-assessment' } };
    }
    case 'cloze': {
      const p = payload as Extract<AnswerPayload, { type: 'cloze' }>;
      const parts = question.blanks.map((b) => {
        const given = p.blanks?.[b.id] ?? '';
        return { id: b.id, correct: matchesAccepted(given, b.acceptedAnswers, b.normalization), expected: b.acceptedAnswers, given };
      });
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'ordering': {
      const p = payload as Extract<AnswerPayload, { type: 'ordering' }>;
      const expected = question.answer.orderedIds;
      const given = p.orderedIds ?? [];
      const parts = expected.map((id, i) => ({ id, correct: given[i] === id, expected: id, given: given[i] ?? null }));
      const correct = given.length === expected.length && parts.every((x) => x.correct);
      return { isCorrect: correct, gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'matching': {
      const p = payload as Extract<AnswerPayload, { type: 'matching' }>;
      const givenMap = new Map((p.pairs ?? []).map((x) => [x.leftId, x.rightId] as const));
      const parts = question.answer.pairs.map((pair) => ({
        id: pair.leftId,
        correct: givenMap.get(pair.leftId) === pair.rightId,
        expected: pair.rightId,
        given: givenMap.get(pair.leftId) ?? null,
      }));
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
  }
}

export function isObjectivelyGradable(type: Question['type']): boolean {
  return type !== 'essay';
}
