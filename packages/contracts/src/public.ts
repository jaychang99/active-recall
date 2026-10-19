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
    case 'numeric': {
      const { answer, ...rest } = q;
      return { ...rest, answer: answer.unit ? { unit: answer.unit } : {} };
    }
    case 'cloze_select': {
      const { blanks, ...rest } = q;
      return { ...rest, blanks: blanks.map((b) => ({ id: b.id, options: b.options })) };
    }
    case 'statement_set': {
      const { statements, ...rest } = q;
      return { ...rest, statements: statements.map((s) => ({ id: s.id, text: s.text })) };
    }
    case 'categorize': {
      const { items, ...rest } = q;
      return { ...rest, items: items.map((i) => ({ id: i.id, text: i.text })) };
    }
    case 'recall_card': {
      const { back: _back, answer, ...rest } = q;
      return { ...rest, hasAcceptedAnswers: !!answer?.acceptedAnswers?.length };
    }
    case 'stepwise': {
      const { steps, ...rest } = q;
      return { ...rest, steps: steps.map((s) => ({ id: s.id, prompt: s.prompt })) };
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
    case 'numeric':
      return { type: q.type, answer: q.answer };
    case 'cloze_select':
      return { type: q.type, blanks: q.blanks.map((b) => ({ id: b.id, optionIds: b.options.map((o) => o.id), answerOptionId: b.answerOptionId })), placeholders: q.prompt.match(/\{\{[^}]+\}\}/g) ?? [] };
    case 'statement_set':
      return { type: q.type, statements: q.statements.map((s) => ({ id: s.id, value: s.value })) };
    case 'categorize':
      return { type: q.type, categories: q.categories.map((c) => c.id), items: q.items.map((i) => ({ id: i.id, categoryId: i.categoryId })) };
    case 'two_tier':
      return { type: q.type, choiceIds: q.choices.map((c) => c.id), reasonIds: q.reasons.map((r) => r.id), answer: q.answer };
    case 'recall_card':
      return { type: q.type, back: q.back, answer: q.answer ?? null };
    case 'stepwise':
      return { type: q.type, steps: q.steps.map((s) => ({ id: s.id, acceptedAnswers: s.acceptedAnswers, normalization: s.normalization ?? null })) };
    case 'highlight':
      return { type: q.type, segmentIds: q.segments.map((s) => s.id), answer: q.answer };
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
