import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schemaJson from './question-batch.schema.json';
import { QUESTION_TYPES, type QuestionBatch, type QuestionType } from './types';

export const questionBatchSchema = schemaJson as Record<string, unknown>;

export interface ValidationIssue {
  /** JSON pointer into the batch document, e.g. /questions/3/answer/choiceId */
  path: string;
  /** Index into `questions` when the issue belongs to one question. */
  questionIndex?: number;
  /** Question id if it could be read (even when otherwise invalid). */
  questionId?: string;
  message: string;
  keyword?: string;
  /** `schema` = JSON Schema violation, `semantic` = cross-reference invariant, `limit` = size limit. */
  kind: 'schema' | 'semantic' | 'limit';
}

export interface SchemaValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

function buildAjv() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
    // JSON Schema `default` keywords are informational for this contract; do not mutate input.
    useDefaults: false,
  });
  addFormats(ajv);
  return ajv;
}

let cache:
  | {
      batch: ValidateFunction;
      byType: Record<QuestionType, ValidateFunction>;
    }
  | undefined;

function compiled() {
  if (cache) return cache;
  const ajv = buildAjv();
  const batch = ajv.compile(questionBatchSchema);
  const defs = (questionBatchSchema as { $defs: Record<string, unknown> }).$defs;
  const byType = {} as Record<QuestionType, ValidateFunction>;
  for (const t of QUESTION_TYPES) {
    const sub = defs[t] as Record<string, unknown>;
    byType[t] = ajv.compile({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...sub });
  }
  cache = { batch, byType };
  return cache;
}

function humanize(err: ErrorObject): string {
  const p = err.params as Record<string, unknown>;
  switch (err.keyword) {
    case 'required':
      return `missing required property "${String(p.missingProperty)}"`;
    case 'additionalProperties':
      return `unknown property "${String(p.additionalProperty)}" is not allowed`;
    case 'const':
      return `must be exactly ${JSON.stringify(p.allowedValue)}`;
    case 'enum':
      return `must be one of ${JSON.stringify(p.allowedValues)}`;
    case 'pattern':
      return `does not match the required pattern ${String(p.pattern)}`;
    case 'minItems':
      return `must contain at least ${String(p.limit)} item(s)`;
    case 'maxItems':
      return `must contain at most ${String(p.limit)} item(s)`;
    case 'minLength':
      return `must be at least ${String(p.limit)} character(s)`;
    case 'maxLength':
      return `must be at most ${String(p.limit)} character(s)`;
    case 'uniqueItems':
      return `items must be unique (duplicate at positions ${String(p.i)} and ${String(p.j)})`;
    case 'type':
      return `must be of type ${String(p.type)}`;
    case 'minimum':
    case 'maximum':
      return `must be ${err.keyword === 'minimum' ? '>=' : '<='} ${String(p.limit)}`;
    case 'format':
      return `must be a valid ${String(p.format)}`;
    default:
      return err.message ?? err.keyword;
  }
}

function issueFromError(err: ErrorObject, basePath: string, qi?: number, qid?: string): ValidationIssue {
  return {
    path: basePath + err.instancePath,
    questionIndex: qi,
    questionId: qid,
    message: humanize(err),
    keyword: err.keyword,
    kind: 'schema',
  };
}

/**
 * Validate a parsed JSON document against the batch schema.
 * The top-level validator is authoritative. Because `questions[]` is a `oneOf` over 8 types,
 * raw AJV errors are noisy, so when the top-level fails we re-validate each question against
 * the sub-schema for its declared `type` to produce readable, pointed issues.
 */
export function validateBatchSchema(input: unknown): SchemaValidationResult {
  const { batch, byType } = compiled();
  if (batch(input)) return { ok: true, issues: [] };

  const issues: ValidationIssue[] = [];
  const rawErrors = batch.errors ?? [];

  // Non-question errors (deck, schemaVersion, top-level) are reported as-is.
  for (const err of rawErrors) {
    if (err.instancePath.startsWith('/questions/')) continue;
    if (err.instancePath === '/questions' && err.keyword !== 'oneOf') {
      issues.push(issueFromError(err, ''));
      continue;
    }
    if (err.instancePath === '/questions') continue;
    issues.push(issueFromError(err, ''));
  }

  const obj = input as { questions?: unknown };
  if (Array.isArray(obj?.questions)) {
    obj.questions.forEach((q, qi) => {
      const base = `/questions/${qi}`;
      if (!q || typeof q !== 'object' || Array.isArray(q)) {
        issues.push({ path: base, questionIndex: qi, message: 'must be an object', kind: 'schema' });
        return;
      }
      const rec = q as Record<string, unknown>;
      const qid = typeof rec.id === 'string' ? rec.id : undefined;
      const type = rec.type;
      if (typeof type !== 'string' || !(QUESTION_TYPES as readonly string[]).includes(type)) {
        issues.push({
          path: `${base}/type`,
          questionIndex: qi,
          questionId: qid,
          message: `unknown question type ${JSON.stringify(type)}; expected one of ${QUESTION_TYPES.join(', ')}`,
          keyword: 'enum',
          kind: 'schema',
        });
        return;
      }
      const v = byType[type as QuestionType];
      if (!v(q)) {
        for (const err of v.errors ?? []) issues.push(issueFromError(err, base, qi, qid));
      }
    });
  }

  if (issues.length === 0) {
    // Should not happen, but never claim validity when AJV said no.
    for (const err of rawErrors) issues.push(issueFromError(err, ''));
  }
  return { ok: false, issues: dedupe(issues) };
}

function dedupe(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.path}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function isQuestionBatch(input: unknown): input is QuestionBatch {
  return validateBatchSchema(input).ok;
}
