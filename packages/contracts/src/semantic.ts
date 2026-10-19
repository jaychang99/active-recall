import { extractClozeIds } from './normalize';
import type { Question, QuestionBatch } from './types';
import type { ValidationIssue } from './schema';

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  const d = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) d.add(id);
    seen.add(id);
  }
  return [...d];
}

function issue(path: string, qi: number, qid: string, message: string): ValidationIssue {
  return { path, questionIndex: qi, questionId: qid, message, kind: 'semantic' };
}

/**
 * Cross-reference invariants that JSON Schema cannot express (see schema `$comment`).
 * Assumes the input already passed schema validation.
 */
export function validateQuestionSemantics(q: Question, qi: number): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const base = `/questions/${qi}`;
  const push = (p: string, m: string) => out.push(issue(base + p, qi, q.id, m));

  switch (q.type) {
    case 'single_choice': {
      const ids = q.choices.map((c) => c.id);
      for (const d of dupes(ids)) push('/choices', `duplicate choice id "${d}"`);
      if (!ids.includes(q.answer.choiceId))
        push('/answer/choiceId', `answer choiceId "${q.answer.choiceId}" is not one of the choices`);
      break;
    }
    case 'multiple_choice': {
      const ids = q.choices.map((c) => c.id);
      for (const d of dupes(ids)) push('/choices', `duplicate choice id "${d}"`);
      for (const a of q.answer.choiceIds)
        if (!ids.includes(a)) push('/answer/choiceIds', `answer choiceId "${a}" is not one of the choices`);
      if (q.answer.choiceIds.length < 2) push('/answer/choiceIds', 'multiple_choice needs at least 2 correct choices');
      if (q.answer.choiceIds.length >= ids.length)
        push('/answer/choiceIds', 'multiple_choice needs at least one incorrect choice (answers must be a proper subset)');
      break;
    }
    case 'true_false':
    case 'short_answer':
      break;
    case 'essay': {
      const sum = q.answer.rubric.reduce((s, r) => s + r.maxPoints, 0);
      if (sum !== q.answer.maxScore)
        push('/answer/rubric', `rubric maxPoints sum (${sum}) must equal answer.maxScore (${q.answer.maxScore})`);
      break;
    }
    case 'cloze': {
      const blankIds = q.blanks.map((b) => b.id);
      for (const d of dupes(blankIds)) push('/blanks', `duplicate blank id "${d}"`);
      const inPrompt = extractClozeIds(q.prompt);
      for (const d of dupes(inPrompt)) push('/prompt', `placeholder {{${d}}} appears more than once`);
      const promptSet = new Set(inPrompt);
      const blankSet = new Set(blankIds);
      for (const id of blankSet) if (!promptSet.has(id)) push('/prompt', `blank "${id}" has no {{${id}}} placeholder in prompt`);
      for (const id of promptSet) if (!blankSet.has(id)) push('/blanks', `placeholder {{${id}}} has no matching blank definition`);
      break;
    }
    case 'ordering': {
      const itemIds = q.items.map((i) => i.id);
      for (const d of dupes(itemIds)) push('/items', `duplicate item id "${d}"`);
      const a = q.answer.orderedIds;
      const sameLen = a.length === itemIds.length;
      const allKnown = a.every((id) => itemIds.includes(id));
      if (!sameLen || !allKnown || new Set(a).size !== a.length)
        push('/answer/orderedIds', 'orderedIds must be a permutation of items[].id');
      break;
    }
    case 'matching': {
      const l = q.left.map((i) => i.id);
      const r = q.right.map((i) => i.id);
      for (const d of dupes(l)) push('/left', `duplicate left id "${d}"`);
      for (const d of dupes(r)) push('/right', `duplicate right id "${d}"`);
      const pl = q.answer.pairs.map((p) => p.leftId);
      const pr = q.answer.pairs.map((p) => p.rightId);
      for (const d of dupes(pl)) push('/answer/pairs', `left id "${d}" is paired more than once`);
      for (const d of dupes(pr)) push('/answer/pairs', `right id "${d}" is paired more than once`);
      for (const id of pl) if (!l.includes(id)) push('/answer/pairs', `leftId "${id}" is not in left`);
      for (const id of pr) if (!r.includes(id)) push('/answer/pairs', `rightId "${id}" is not in right`);
      if (!(pl.length === l.length && pl.length === r.length))
        push('/answer/pairs', 'pairs must form a 1:1 bijection between every left and right item');
      break;
    }
  }
  if (q.explanation.summary.trim().length === 0) push('/explanation/summary', 'explanation summary must not be blank');
  return out;
}

export function validateBatchSemantics(batch: QuestionBatch): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const d of dupes(batch.questions.map((q) => q.id)))
    out.push({ path: '/questions', message: `duplicate question id "${d}" within deck`, kind: 'semantic' });
  batch.questions.forEach((q, i) => out.push(...validateQuestionSemantics(q, i)));
  return out;
}
