import type { PublicQuestion, Question } from './types';

/** Strip the answer key so Study/Exam screens cannot leak it before submission. */
export function toPublicQuestion(q: Question): PublicQuestion {
  switch (q.type) {
    case 'essay': {
      const { answer, ...rest } = q;
      return { ...rest, answer: { maxScore: answer.maxScore } };
    }
    case 'cloze': {
      const { blanks, ...rest } = q;
      return { ...rest, blanks: blanks.map((b) => ({ id: b.id })) };
    }
    default: {
      const { answer: _answer, ...rest } = q;
      return rest as PublicQuestion;
    }
  }
}

/** The portion of a question that defines "what counts as correct". Used for answerHash. */
export function answerSignature(q: Question): unknown {
  switch (q.type) {
    case 'single_choice':
    case 'multiple_choice':
      return { type: q.type, choiceIds: q.choices.map((c) => c.id), answer: q.answer };
    case 'true_false':
    case 'short_answer':
    case 'essay':
      return { type: q.type, answer: q.answer };
    case 'cloze':
      return { type: q.type, blanks: q.blanks, placeholders: q.prompt.match(/\{\{[^}]+\}\}/g) ?? [] };
    case 'ordering':
      return { type: q.type, itemIds: q.items.map((i) => i.id), answer: q.answer };
    case 'matching':
      return { type: q.type, left: q.left.map((i) => i.id), right: q.right.map((i) => i.id), answer: q.answer };
  }
}

/** Deterministic JSON (sorted keys) for hashing. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        if (o[k] !== undefined) acc[k] = sortKeys(o[k]);
        return acc;
      }, {});
  }
  return v;
}
