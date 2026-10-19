import { matchesAccepted } from './normalize';
import type { AnswerPayload, GradeResult, Question, RecallCardQuestion } from './types';

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
    const manual = question.type === 'essay' || (question.type === 'recall_card' && !question.answer?.acceptedAnswers?.length);
    return { isCorrect: manual ? null : false, gradable: !manual, detail: { note: 'no answer submitted' } };
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
    case 'numeric': {
      const p = payload as Extract<AnswerPayload, { type: 'numeric' }>;
      const { value, tolerance = 0, relativeTolerance = 0 } = question.answer;
      const given = typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null;
      const allowed = Math.max(tolerance, Math.abs(value) * relativeTolerance);
      const correct = given !== null && Math.abs(given - value) <= allowed + 1e-12;
      return { isCorrect: correct, gradable: true, detail: { parts: [{ id: 'value', correct, expected: String(value), given: given === null ? null : String(given) }], note: allowed ? `±${allowed}` : undefined } };
    }
    case 'cloze_select': {
      const p = payload as Extract<AnswerPayload, { type: 'cloze_select' }>;
      const parts = question.blanks.map((b) => ({ id: b.id, correct: p.blanks?.[b.id] === b.answerOptionId, expected: b.answerOptionId, given: p.blanks?.[b.id] ?? null }));
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'statement_set': {
      const p = payload as Extract<AnswerPayload, { type: 'statement_set' }>;
      const parts = question.statements.map((s) => ({ id: s.id, correct: p.values?.[s.id] === s.value, expected: String(s.value), given: p.values?.[s.id] === undefined || p.values?.[s.id] === null ? null : String(p.values[s.id]) }));
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'categorize': {
      const p = payload as Extract<AnswerPayload, { type: 'categorize' }>;
      const parts = question.items.map((it) => ({ id: it.id, correct: p.assignments?.[it.id] === it.categoryId, expected: it.categoryId, given: p.assignments?.[it.id] ?? null }));
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'two_tier': {
      const p = payload as Extract<AnswerPayload, { type: 'two_tier' }>;
      const parts = [
        { id: 'choice', correct: p.choiceId === question.answer.choiceId, expected: question.answer.choiceId, given: p.choiceId },
        { id: 'reason', correct: p.reasonId === question.answer.reasonId, expected: question.answer.reasonId, given: p.reasonId },
      ];
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / 2, note: parts[0]!.correct && !parts[1]!.correct ? 'answer right, reasoning wrong' : !parts[0]!.correct && parts[1]!.correct ? 'reason right, answer wrong' : undefined } };
    }
    case 'recall_card': {
      const p = payload as Extract<AnswerPayload, { type: 'recall_card' }>;
      const accepted = question.answer?.acceptedAnswers;
      if (accepted?.length && typeof p.text === 'string' && p.text.trim()) {
        const correct = matchesAccepted(p.text, accepted, question.answer?.normalization);
        return { isCorrect: correct, gradable: true, detail: { parts: [{ id: 'text', correct, expected: accepted, given: p.text }] } };
      }
      // self-checked: the learner compares with the back side and marks ✓/✗
      return { isCorrect: typeof p.selfCorrect === 'boolean' ? p.selfCorrect : null, gradable: false, detail: { note: 'self-check against the back side' } };
    }
    case 'stepwise': {
      const p = payload as Extract<AnswerPayload, { type: 'stepwise' }>;
      const parts = question.steps.map((s) => {
        const given = p.answers?.[s.id] ?? '';
        return { id: s.id, correct: matchesAccepted(given, s.acceptedAnswers, s.normalization), expected: s.acceptedAnswers, given };
      });
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'highlight': {
      const p = payload as Extract<AnswerPayload, { type: 'highlight' }>;
      const expected = new Set(question.answer.segmentIds);
      const given = new Set(p.segmentIds ?? []);
      const parts = question.segments.map((s) => ({ id: s.id, correct: expected.has(s.id) === given.has(s.id), expected: expected.has(s.id) ? 'selected' : 'not-selected', given: given.has(s.id) ? 'selected' : 'not-selected' }));
      return { isCorrect: sameSet([...expected], [...given]), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
  }
}

/** Essay is always manual; recall_card is manual unless it carries acceptedAnswers. */
export function isObjectivelyGradable(q: Pick<Question, 'type'> & { answer?: unknown }): boolean {
  if (q.type === 'essay') return false;
  if (q.type === 'recall_card') return !!((q as RecallCardQuestion).answer?.acceptedAnswers?.length);
  return true;
}
