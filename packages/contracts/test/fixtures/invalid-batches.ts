import example from '../../../../examples/example-question-batch.json';
import type { QuestionBatch } from '../../src/index';

export const validBatch = example as unknown as QuestionBatch;

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Each fixture: name, mutate(batch), expected substring in at least one issue message. */
export const invalidFixtures: { name: string; mutate: (b: QuestionBatch) => unknown; expect: string }[] = [
  { name: 'unknown question type', mutate: (b) => { (b.questions[0] as { type: string }).type = 'fill_gap'; return b; }, expect: 'unknown question type' },
  { name: 'malformed answer (single_choice missing choiceId)', mutate: (b) => { (b.questions[0] as { answer: unknown }).answer = {}; return b; }, expect: 'missing required property "choiceId"' },
  { name: 'missing explanation', mutate: (b) => { delete (b.questions[2] as { explanation?: unknown }).explanation; return b; }, expect: 'missing required property "explanation"' },
  { name: 'invalid id pattern', mutate: (b) => { b.questions[0]!.id = '-bad id!'; return b; }, expect: 'pattern' },
  { name: 'unknown schemaVersion', mutate: (b) => { (b as { schemaVersion: string }).schemaVersion = '2.0.0'; return b; }, expect: 'unsupported schemaVersion' },
  { name: 'additional property', mutate: (b) => { (b.questions[0] as unknown as Record<string, unknown>).bogus = 1; return b; }, expect: 'unknown property "bogus"' },
  { name: 'empty questions', mutate: (b) => { b.questions = []; return b; }, expect: 'at least 1' },
  { name: 'duplicate question ids', mutate: (b) => { b.questions[1]!.id = b.questions[0]!.id; return b; }, expect: 'duplicate question id' },
  { name: 'duplicate choice ids', mutate: (b) => { const q = b.questions[0]; if (q?.type === 'single_choice') q.choices[1]!.id = q.choices[0]!.id; return b; }, expect: 'duplicate choice id' },
  { name: 'wrong choice reference', mutate: (b) => { const q = b.questions[0]; if (q?.type === 'single_choice') q.answer.choiceId = 'zzz'; return b; }, expect: 'not one of the choices' },
  { name: 'multiple_choice all correct', mutate: (b) => { const q = b.questions[1]; if (q?.type === 'multiple_choice') q.answer.choiceIds = ['a', 'b', 'c', 'd']; return b; }, expect: 'proper subset' },
  { name: 'cloze missing blank', mutate: (b) => { const q = b.questions[5]; if (q?.type === 'cloze') q.prompt = 'only {{b1}} here and {{b3}}'; return b; }, expect: 'no matching blank' },
  { name: 'ordering not permutation', mutate: (b) => { const q = b.questions[6]; if (q?.type === 'ordering') q.answer.orderedIds = ['syn', 'synack', 'nope']; return b; }, expect: 'permutation' },
  { name: 'matching not bijection', mutate: (b) => { const q = b.questions[7]; if (q?.type === 'matching') q.answer.pairs = [{ leftId: 'dns', rightId: 'name' }, { leftId: 'dhcp', rightId: 'name' }, { leftId: 'arp', rightId: 'mapping' }]; return b; }, expect: 'paired more than once' },
  { name: 'rubric total mismatch', mutate: (b) => { const q = b.questions[4]; if (q?.type === 'essay') q.answer.maxScore = 11; return b; }, expect: 'must equal answer.maxScore' },
  { name: 'essay segment points without rubricIndex', mutate: (b) => { const q = b.questions[4]; if (q?.type === 'essay') delete q.answer.modelAnswerSegments![0]!.rubricIndex; return b; }, expect: 'points and rubricIndex must be given together' },
  { name: 'essay segment rubricIndex out of range', mutate: (b) => { const q = b.questions[4]; if (q?.type === 'essay') q.answer.modelAnswerSegments![0]!.rubricIndex = 5; return b; }, expect: 'out of range' },
  { name: 'essay segment points exceed criterion', mutate: (b) => { const q = b.questions[4]; if (q?.type === 'essay') q.answer.modelAnswerSegments![0]!.points = 3; return b; }, expect: 'exceed its maxPoints' },
  { name: 'essay segments with no scored segment', mutate: (b) => { const q = b.questions[4]; if (q?.type === 'essay') q.answer.modelAnswerSegments = [{ text: 'x' }]; return b; }, expect: 'at least one scored segment' },
  { name: 'essay segment unknown property', mutate: (b) => { const q = b.questions[4]; if (q?.type === 'essay') (q.answer.modelAnswerSegments![0] as unknown as Record<string, unknown>).score = 1; return b; }, expect: 'score' },
];
