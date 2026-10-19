import { IMPORT_LIMITS } from './json';
import { validateBatchSchema, type ValidationIssue } from './schema';
import { validateBatchSemantics } from './semantic';
import { QUESTION_TYPES, type QuestionBatch, type QuestionType } from './types';

export interface FullValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  batch?: QuestionBatch;
  summary?: { deckId: string; title: string; total: number; byType: Record<QuestionType, number> };
}

/** Schema + semantic validation in one call. Never returns `ok` on schema-only success. */
export function validateBatch(input: unknown): FullValidationResult {
  const limitIssues: ValidationIssue[] = [];
  const maybe = input as { questions?: unknown; schemaVersion?: unknown } | null;
  if (maybe && typeof maybe === 'object' && 'schemaVersion' in maybe && maybe.schemaVersion !== '1.0.0') {
    limitIssues.push({
      path: '/schemaVersion',
      message: `unsupported schemaVersion ${JSON.stringify(maybe.schemaVersion)}; this build supports "1.0.0" only`,
      kind: 'schema',
      keyword: 'const',
    });
  }
  if (maybe && Array.isArray(maybe.questions) && maybe.questions.length > IMPORT_LIMITS.maxQuestions) {
    limitIssues.push({ path: '/questions', message: `too many questions (${maybe.questions.length}); limit is ${IMPORT_LIMITS.maxQuestions}`, kind: 'limit' });
  }
  const schema = validateBatchSchema(input);
  if (!schema.ok || limitIssues.length) {
    const issues = [...limitIssues, ...schema.issues.filter((i) => !(i.path === '/schemaVersion' && limitIssues.some((l) => l.path === '/schemaVersion')))];
    return { ok: false, issues };
  }
  const batch = input as QuestionBatch;
  const semantic = validateBatchSemantics(batch);
  const byType = Object.fromEntries(QUESTION_TYPES.map((t) => [t, 0])) as Record<QuestionType, number>;
  for (const q of batch.questions) byType[q.type]++;
  return {
    ok: semantic.length === 0,
    issues: semantic,
    batch,
    summary: { deckId: batch.deck.id, title: batch.deck.title, total: batch.questions.length, byType },
  };
}
