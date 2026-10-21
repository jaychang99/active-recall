import generatorPrompt from '@/lib/generated/question-generator-prompt';

/**
 * The CONFIG block of docs/QUESTION_GENERATOR_PROMPT.md as a typed object.
 * The prompt document stays the source of truth: PROMPT_DEFAULTS is parsed from it at module load,
 * saved defaults (Settings.promptDefaults) overlay it, and a one-off copy overlays that.
 */

export const CORE_TYPES = ['single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay', 'cloze', 'ordering', 'matching'] as const;
export type CoreType = (typeof CORE_TYPES)[number];

export const SOURCE_MODES = ['provided_materials', 'general_knowledge'] as const;
export const COVERAGES = ['balanced_across_topics', 'follow_material_order'] as const;
export const EXPLANATION_DEPTHS = ['brief', 'standard', 'detailed'] as const;
export const MATH_NOTATIONS = ['latex', 'plain'] as const;
export const SOURCE_LOCATORS = ['always', 'only_if_verifiable', 'never'] as const;
export const LANGUAGE_PRESETS = ['auto', 'ko', 'en', 'ja', 'zh'] as const;

export interface PromptOptions {
  deckId: string;
  deckTitle: string;
  subject: string;
  outputLanguage: string;
  numberOfQuestions: number | 'auto';
  sourceMode: (typeof SOURCE_MODES)[number];
  /** general_knowledge mode only: what to generate from. Empty strings / empty list print as '-' in CONFIG. */
  mainTopic: string;
  subtopics: string[];
  audienceLevel: string;
  coverage: (typeof COVERAGES)[number];
  difficulty: { easy: number; medium: number; hard: number };
  typeTarget: Record<CoreType, number>;
  requireAllEightTypes: boolean;
  allowExtendedTypes: boolean;
  mcqChoiceCount: number;
  explanationDepth: (typeof EXPLANATION_DEPTHS)[number];
  mathNotation: (typeof MATH_NOTATIONS)[number];
  allowOutOfScopeInformation: boolean;
  includeSourceLocators: (typeof SOURCE_LOCATORS)[number];
}

export const LIMITS = { numberOfQuestions: { min: 1, max: 10_000 }, mcqChoiceCount: { min: 2, max: 8 } } as const;

/** `-` in the CONFIG block means "not set". */
const UNSET = '-';
const fromUnset = (v: string | undefined) => (!v || v === UNSET ? '' : v);
const toUnset = (v: string) => (v.trim() ? v.trim() : UNSET);

export function parseSubtopics(raw: string): string[] {
  return raw.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
}

/** Key in the prompt's CONFIG block for every option (SCHEMA_VERSION is fixed and never edited). */
const KEYS: Record<keyof PromptOptions, string> = {
  deckId: 'DECK_ID',
  deckTitle: 'DECK_TITLE',
  subject: 'SUBJECT',
  outputLanguage: 'OUTPUT_LANGUAGE',
  numberOfQuestions: 'NUMBER_OF_QUESTIONS',
  sourceMode: 'SOURCE_MODE',
  mainTopic: 'MAIN_TOPIC',
  subtopics: 'SUBTOPICS',
  audienceLevel: 'AUDIENCE_LEVEL',
  coverage: 'COVERAGE',
  difficulty: 'DIFFICULTY_DISTRIBUTION',
  typeTarget: 'QUESTION_TYPE_TARGET',
  requireAllEightTypes: 'REQUIRE_ALL_EIGHT_TYPES',
  allowExtendedTypes: 'ALLOW_EXTENDED_TYPES',
  mcqChoiceCount: 'MCQ_CHOICE_COUNT',
  explanationDepth: 'EXPLANATION_DEPTH',
  mathNotation: 'MATH_NOTATION',
  allowOutOfScopeInformation: 'ALLOW_OUT_OF_SCOPE_INFORMATION',
  includeSourceLocators: 'INCLUDE_SOURCE_LOCATORS',
};

function parsePercentList(raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of raw.split(',')) {
    const m = part.trim().match(/^([a-z_]+)\s*=\s*(\d+(?:\.\d+)?)%?$/i);
    if (m) out[m[1]!] = Number(m[2]);
  }
  return out;
}

/** Reads `KEY: value   # comment` lines out of the CONFIG block. Values are trimmed; comments dropped. */
export function readConfigValues(prompt: string): Record<string, string> {
  const block = prompt.match(/```text\n([\s\S]*?)```/);
  const values: Record<string, string> = {};
  for (const line of (block?.[1] ?? '').split('\n')) {
    const m = line.match(/^([A-Z_]+):\s*(.*?)\s*(?:#.*)?$/);
    if (m) values[m[1]!] = m[2]!;
  }
  return values;
}

function oneOf<T extends readonly string[]>(list: T, v: string | undefined, fallback: T[number]): T[number] {
  return v && (list as readonly string[]).includes(v) ? (v as T[number]) : fallback;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseOptions(values: Record<string, string>): PromptOptions {
  const diff = parsePercentList(values.DIFFICULTY_DISTRIBUTION ?? '');
  const types = parsePercentList(values.QUESTION_TYPE_TARGET ?? '');
  const typeTarget = Object.fromEntries(CORE_TYPES.map((t) => [t, types[t] ?? 0])) as Record<CoreType, number>;
  return {
    deckId: values.DECK_ID ?? '',
    deckTitle: values.DECK_TITLE ?? '',
    subject: values.SUBJECT ?? '',
    outputLanguage: values.OUTPUT_LANGUAGE || 'auto',
    numberOfQuestions: values.NUMBER_OF_QUESTIONS === 'auto' && values.SOURCE_MODE !== 'general_knowledge' ? 'auto' : clampInt(values.NUMBER_OF_QUESTIONS, LIMITS.numberOfQuestions.min, LIMITS.numberOfQuestions.max, 24),
    sourceMode: oneOf(SOURCE_MODES, values.SOURCE_MODE, 'provided_materials'),
    mainTopic: fromUnset(values.MAIN_TOPIC),
    subtopics: parseSubtopics(fromUnset(values.SUBTOPICS)),
    audienceLevel: fromUnset(values.AUDIENCE_LEVEL),
    coverage: oneOf(COVERAGES, values.COVERAGE, 'balanced_across_topics'),
    difficulty: { easy: diff.easy ?? 25, medium: diff.medium ?? 50, hard: diff.hard ?? 25 },
    typeTarget,
    requireAllEightTypes: (values.REQUIRE_ALL_EIGHT_TYPES ?? 'true') === 'true',
    allowExtendedTypes: (values.ALLOW_EXTENDED_TYPES ?? 'true') === 'true',
    mcqChoiceCount: clampInt(values.MCQ_CHOICE_COUNT, LIMITS.mcqChoiceCount.min, LIMITS.mcqChoiceCount.max, 5),
    explanationDepth: oneOf(EXPLANATION_DEPTHS, values.EXPLANATION_DEPTH, 'detailed'),
    mathNotation: oneOf(MATH_NOTATIONS, values.MATH_NOTATION, 'latex'),
    allowOutOfScopeInformation: (values.ALLOW_OUT_OF_SCOPE_INFORMATION ?? 'false') === 'true',
    includeSourceLocators: oneOf(SOURCE_LOCATORS, values.INCLUDE_SOURCE_LOCATORS, 'only_if_verifiable'),
  };
}

/** The values written in the prompt document itself. */
export const PROMPT_DEFAULTS: PromptOptions = parseOptions(readConfigValues(generatorPrompt));

/** Saved defaults are stored as a partial object; anything missing or invalid falls back to the prompt's values. */
export function resolvePromptOptions(saved: unknown, base: PromptOptions = PROMPT_DEFAULTS): PromptOptions {
  if (!saved || typeof saved !== 'object') return { ...base, difficulty: { ...base.difficulty }, typeTarget: { ...base.typeTarget }, subtopics: [...base.subtopics] };
  const s = saved as Partial<Record<keyof PromptOptions, unknown>>;
  const str = (v: unknown, fb: string) => (typeof v === 'string' ? v : fb);
  const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);
  const pct = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : fb);
  const d = (s.difficulty ?? {}) as Partial<PromptOptions['difficulty']>;
  const t = (s.typeTarget ?? {}) as Partial<Record<CoreType, number>>;
  const sourceMode = oneOf(SOURCE_MODES, str(s.sourceMode, ''), base.sourceMode);
  const count = s.numberOfQuestions ?? base.numberOfQuestions;
  return {
    deckId: str(s.deckId, base.deckId),
    deckTitle: str(s.deckTitle, base.deckTitle),
    subject: str(s.subject, base.subject),
    outputLanguage: str(s.outputLanguage, base.outputLanguage) || 'auto',
    numberOfQuestions: count === 'auto' && sourceMode === 'provided_materials' ? 'auto' : clampInt(count, LIMITS.numberOfQuestions.min, LIMITS.numberOfQuestions.max, typeof base.numberOfQuestions === 'number' ? base.numberOfQuestions : 24),
    sourceMode,
    mainTopic: str(s.mainTopic, base.mainTopic),
    subtopics: Array.isArray(s.subtopics) ? (s.subtopics as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [...base.subtopics],
    audienceLevel: str(s.audienceLevel, base.audienceLevel),
    coverage: oneOf(COVERAGES, str(s.coverage, ''), base.coverage),
    difficulty: { easy: pct(d.easy, base.difficulty.easy), medium: pct(d.medium, base.difficulty.medium), hard: pct(d.hard, base.difficulty.hard) },
    typeTarget: Object.fromEntries(CORE_TYPES.map((k) => [k, pct(t[k], base.typeTarget[k])])) as Record<CoreType, number>,
    requireAllEightTypes: bool(s.requireAllEightTypes, base.requireAllEightTypes),
    allowExtendedTypes: bool(s.allowExtendedTypes, base.allowExtendedTypes),
    mcqChoiceCount: clampInt(s.mcqChoiceCount, LIMITS.mcqChoiceCount.min, LIMITS.mcqChoiceCount.max, base.mcqChoiceCount),
    explanationDepth: oneOf(EXPLANATION_DEPTHS, str(s.explanationDepth, ''), base.explanationDepth),
    mathNotation: oneOf(MATH_NOTATIONS, str(s.mathNotation, ''), base.mathNotation),
    allowOutOfScopeInformation: bool(s.allowOutOfScopeInformation, base.allowOutOfScopeInformation),
    includeSourceLocators: oneOf(SOURCE_LOCATORS, str(s.includeSourceLocators, ''), base.includeSourceLocators),
  };
}

/** The value text written after `KEY:` for each option. */
export function configValue(key: keyof PromptOptions, o: PromptOptions): string {
  switch (key) {
    case 'difficulty': return `easy=${o.difficulty.easy}%, medium=${o.difficulty.medium}%, hard=${o.difficulty.hard}%`;
    case 'typeTarget': return CORE_TYPES.map((t) => `${t}=${o.typeTarget[t]}%`).join(', ');
    case 'requireAllEightTypes': case 'allowExtendedTypes': case 'allowOutOfScopeInformation': return String(o[key]);
    case 'numberOfQuestions': return o.numberOfQuestions === 'auto' ? (o.sourceMode === 'general_knowledge' ? '24' : 'auto') : String(clampInt(o.numberOfQuestions, LIMITS.numberOfQuestions.min, LIMITS.numberOfQuestions.max, 24));
    case 'mcqChoiceCount': return String(o[key]);
    case 'subtopics': return o.subtopics.length ? o.subtopics.join('; ') : UNSET;
    case 'mainTopic': case 'audienceLevel': return toUnset(o[key]);
    case 'deckId': case 'deckTitle': case 'subject': return o[key].trim() || 'auto';
    default: return String(o[key]);
  }
}

/** Rewrites the CONFIG block lines in place, keeping each line's trailing comment and the rest of the document untouched. */
export function applyPromptOptions(prompt: string, o: PromptOptions): string {
  let out = prompt;
  for (const key of Object.keys(KEYS) as (keyof PromptOptions)[]) {
    const name = KEYS[key];
    const re = new RegExp(`^(${name}:\\s*)(.*?)(\\s*#.*)?$`, 'm');
    out = out.replace(re, (_m, head: string, _value: string, comment?: string) => `${head}${configValue(key, o)}${comment ?? ''}`);
  }
  return out;
}

/** Just the CONFIG block as it will be copied (for the live preview). */
export function renderConfigBlock(o: PromptOptions): string {
  const block = applyPromptOptions(generatorPrompt, o).match(/```text\n([\s\S]*?)```/);
  return block?.[1]?.trimEnd() ?? '';
}

export function sumDifficulty(o: PromptOptions): number {
  return o.difficulty.easy + o.difficulty.medium + o.difficulty.hard;
}
export function sumTypeTarget(o: PromptOptions): number {
  return CORE_TYPES.reduce((a, t) => a + o.typeTarget[t], 0);
}

/** Keys where a one-off copy differs from the given base — shown as "변경됨" marks. */
export function changedKeys(a: PromptOptions, b: PromptOptions): (keyof PromptOptions)[] {
  return (Object.keys(KEYS) as (keyof PromptOptions)[]).filter((k) => configValue(k, a) !== configValue(k, b));
}

/** Only the fields that differ from the prompt document are saved (every field can be a default), so the document stays the default for everything else. */
export function toSavedDefaults(o: PromptOptions): Partial<PromptOptions> | null {
  const diff: Partial<PromptOptions> = {};
  for (const k of changedKeys(o, PROMPT_DEFAULTS)) (diff as Record<string, unknown>)[k] = o[k];
  return Object.keys(diff).length ? diff : null;
}

export const TYPE_LABEL_KO: Record<CoreType, string> = { single_choice: '단일선택', multiple_choice: '복수선택', true_false: 'OX', short_answer: '단답형', essay: '서술형', cloze: '빈칸', ordering: '순서배열', matching: '연결형' };

/**
 * Set one share of a percentage distribution and redistribute the rest over the other keys in
 * proportion to their current values (equally when they are all zero), rounding to integers that
 * always sum to exactly 100 (largest-remainder rounding). Relative ratios between the untouched keys are preserved.
 */
export function rebalancePercentages<T extends Record<string, number>>(values: T, key: keyof T & string, next: number): T {
  const keys = Object.keys(values) as (keyof T & string)[];
  const target = Math.min(100, Math.max(0, Math.round(Number.isFinite(next) ? next : 0)));
  const others = keys.filter((k) => k !== key);
  if (!others.length) return { ...values, [key]: 100 } as T;
  const remaining = 100 - target;
  const othersSum = others.reduce((a, k) => a + Math.max(0, values[k] || 0), 0);
  const raw = others.map((k) => (othersSum > 0 ? (Math.max(0, values[k] || 0) / othersSum) * remaining : remaining / others.length));
  const floored = raw.map((v) => Math.floor(v));
  let leftover = remaining - floored.reduce((a, v) => a + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - floored[i]! })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) { if (leftover <= 0) break; floored[i]! += 1; leftover -= 1; }
  const out: Record<string, number> = { ...values, [key]: target };
  others.forEach((k, i) => { out[k] = floored[i]!; });
  return out as T;
}
