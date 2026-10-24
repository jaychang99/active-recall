import type { AnswerPayload, Question } from '@recall/contracts';
import { seededShuffle } from './utils';

/**
 * The order the renderers show a question's lists in. Position-free lists are shuffled per review round when a
 * seed is given (`${seed}:${round}` from the study screen); ordering and Parsons always start scrambled.
 * The renderers and the LLM export both use these, so a copied prompt lists options exactly as on screen.
 */
const shuffled = <T>(list: T[], key: string, seed: string | null) => (seed ? seededShuffle(list, key) : list);

export const viewChoices = <T>(q: { id: string; choices: T[] }, seed: string | null) => shuffled(q.choices, `${q.id}:${seed}`, seed);
export const viewTwoTier = <C, R>(q: { id: string; choices: C[]; reasons: R[] }, seed: string | null) => ({ choices: shuffled(q.choices, `${q.id}:c:${seed}`, seed), reasons: shuffled(q.reasons, `${q.id}:r:${seed}`, seed) });
export const viewMatchingRight = <T>(q: { id: string; right: T[] }, seed: string | null) => shuffled(q.right, `${q.id}:${seed}`, seed);
export const viewCategorize = <I, C>(q: { id: string; items: I[]; categories: C[] }, seed: string | null) => ({ items: shuffled(q.items, `${q.id}:items:${seed}`, seed), categories: shuffled(q.categories, `${q.id}:cats:${seed}`, seed) });
export const viewStatements = <T>(q: { id: string; statements: T[] }, seed: string | null) => shuffled(q.statements, `${q.id}:${seed}`, seed);
export const viewMatrixRows = <T>(q: { id: string; rows: T[] }, seed: string | null) => shuffled(q.rows, `${q.id}:${seed}`, seed);
export const viewClozeOptions = <T>(q: { id: string }, blank: { id: string; options: T[] }, seed: string | null) => shuffled(blank.options, `${q.id}:${blank.id}:${seed}`, seed);
export const viewBank = <T>(q: { id: string; bank: T[] }, seed: string | null) => shuffled(q.bank, `${q.id}:${seed}`, seed);
export const viewOrderingStart = (q: { id: string; items: { id: string }[] }, seed: string | null) => seededShuffle(q.items.map((i) => i.id), `${q.id}:${seed ?? 'fixed'}`);
export const viewParsonsPool = (q: { id: string; blocks: { id: string }[] }, seed: string | null) => seededShuffle(q.blocks.map((b) => b.id), `${q.id}:${seed ?? 'fixed'}`);

const num = (i: number) => String(i + 1);
const letter = (i: number) => String.fromCharCode(65 + i);
type Labeled<T> = T & { label: string };
const label = <T extends object>(list: T[], name: (i: number) => string): Labeled<T>[] => list.map((x, i) => ({ ...x, label: name(i) }));
function byIds<T extends { id: string }>(list: T[], ids: string[]): T[] {
  const map = new Map(list.map((x) => [x.id, x]));
  const out = ids.map((id) => map.get(id)).filter((x): x is T => !!x);
  return [...out, ...list.filter((x) => !ids.includes(x.id))];
}

/**
 * The question as it looks on screen: every shuffled list reordered to the view order and each entry given the
 * `label` the screen shows (1, 2, … for choices, statements and rows; A, B, … for matching targets and categories).
 * Ids and the answer key are untouched, so answers still refer to entries by id.
 */
export function onScreenQuestion(q: Question, seed: string | null, answer: AnswerPayload | null): Question {
  switch (q.type) {
    case 'single_choice':
    case 'multiple_choice':
      return { ...q, choices: label(viewChoices(q, seed), num) };
    case 'two_tier': {
      const v = viewTwoTier(q, seed);
      return { ...q, choices: label(v.choices, num), reasons: label(v.reasons, num) };
    }
    case 'matching':
      return { ...q, left: label(q.left, num), right: label(viewMatchingRight(q, seed), letter) };
    case 'categorize': {
      const v = viewCategorize(q, seed);
      return { ...q, items: label(v.items, num), categories: label(v.categories, letter) };
    }
    case 'statement_set':
      return { ...q, statements: label(viewStatements(q, seed), num) };
    case 'matrix':
      return { ...q, rows: label(viewMatrixRows(q, seed), num) };
    case 'cloze_select':
      return { ...q, blanks: q.blanks.map((b) => ({ ...b, options: viewClozeOptions(q, b, seed) })) };
    case 'cloze_bank':
      return { ...q, bank: viewBank(q, seed) };
    case 'ordering': {
      // After answering the screen shows my arrangement; before that, the starting scramble.
      const ids = answer?.type === 'ordering' && answer.orderedIds.length ? answer.orderedIds : viewOrderingStart(q, seed);
      return { ...q, items: label(byIds(q.items, ids), num) };
    }
    case 'parsons': {
      // The screen draws one pool of lines + distractors; show it in pool order next to the stored lists.
      const blocks = [...q.lines, ...(q.distractors ?? [])];
      return { ...q, blocks: label(byIds(blocks, viewParsonsPool({ id: q.id, blocks }, seed)), num) } as Question;
    }
    default:
      return q;
  }
}

/** My answer and the key in on-screen labels, e.g. "3 (RST)" — only for types whose screen shows labels. */
export function answerInLabels(q: Question, answer: AnswerPayload | null): { mine: string | null; correct: string | null } | null {
  const text = (list: { id: string; label?: string; text?: string }[], id: string | null | undefined) => {
    const x = list.find((c) => c.id === id);
    return x ? `${x.label ?? '?'}${x.text ? ` (${x.text})` : ''}` : null;
  };
  const list = (items: { id: string; label?: string; text?: string }[], ids: string[] | undefined) => (ids?.length ? ids.map((id) => text(items, id) ?? id).join(', ') : null);
  switch (q.type) {
    case 'single_choice':
      return { mine: answer?.type === 'single_choice' ? text(q.choices, answer.choiceId) : null, correct: text(q.choices, q.answer.choiceId) };
    case 'multiple_choice':
      return { mine: answer?.type === 'multiple_choice' ? list(q.choices, answer.choiceIds) : null, correct: list(q.choices, q.answer.choiceIds) };
    case 'two_tier':
      return {
        mine: answer?.type === 'two_tier' ? `답 ${text(q.choices, answer.choiceId) ?? '-'} / 이유 ${text(q.reasons, answer.reasonId) ?? '-'}` : null,
        correct: `답 ${text(q.choices, q.answer.choiceId) ?? '-'} / 이유 ${text(q.reasons, q.answer.reasonId) ?? '-'}`,
      };
    case 'matching': {
      const labelOf = (items: { id: string; label?: string }[], id: string | null) => items.find((x) => x.id === id)?.label ?? '-';
      const pairs = (ps: { leftId: string; rightId: string | null }[]) => ps.map((p) => `${labelOf(q.left, p.leftId)}→${labelOf(q.right, p.rightId)}`).join(', ');
      return { mine: answer?.type === 'matching' ? pairs(answer.pairs) : null, correct: pairs(q.answer.pairs) };
    }
    default:
      return null;
  }
}
