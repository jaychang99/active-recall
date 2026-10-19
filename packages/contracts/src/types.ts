/**
 * Hand-maintained TypeScript mirror of question-batch.schema.json (v1.0.0).
 * The JSON Schema is the source of truth; `test/schema-types.test.ts` keeps
 * these types honest by validating the typed fixtures against the schema.
 */
export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false'
  | 'short_answer'
  | 'essay'
  | 'cloze'
  | 'ordering'
  | 'matching'
  // extended types (additive since 1.0.0; the original eight are unchanged)
  | 'numeric'
  | 'cloze_select'
  | 'statement_set'
  | 'categorize'
  | 'two_tier'
  | 'recall_card'
  | 'stepwise'
  | 'highlight';

export const CORE_QUESTION_TYPES: readonly QuestionType[] = ['single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay', 'cloze', 'ordering', 'matching'] as const;
export const EXTENDED_QUESTION_TYPES: readonly QuestionType[] = ['numeric', 'cloze_select', 'statement_set', 'categorize', 'two_tier', 'recall_card', 'stepwise', 'highlight'] as const;
export const QUESTION_TYPES: readonly QuestionType[] = [...CORE_QUESTION_TYPES, ...EXTENDED_QUESTION_TYPES];

export interface SourceRef {
  document: string;
  location?: string;
  url?: string;
}

export interface Explanation {
  summary: string;
  steps?: string[];
  misconceptions?: string[];
  references?: SourceRef[];
}

export interface QuestionBase {
  id: string;
  prompt: string;
  explanation: Explanation;
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  hint?: string;
  estimatedSeconds?: number;
  source?: SourceRef;
}

export interface Choice {
  id: string;
  text: string;
  explanation?: string;
}

export interface Normalization {
  trim?: boolean;
  unicodeNfkc?: boolean;
  collapseWhitespace?: boolean;
  caseFold?: boolean;
}

export interface SingleChoiceQuestion extends QuestionBase {
  type: 'single_choice';
  choices: Choice[];
  answer: { choiceId: string };
}

export interface MultipleChoiceQuestion extends QuestionBase {
  type: 'multiple_choice';
  choices: Choice[];
  answer: { choiceIds: string[] };
}

export interface TrueFalseQuestion extends QuestionBase {
  type: 'true_false';
  answer: { value: boolean };
}

export interface ShortAnswerQuestion extends QuestionBase {
  type: 'short_answer';
  answer: { acceptedAnswers: string[]; normalization?: Normalization };
}

export interface RubricItem {
  criterion: string;
  maxPoints: number;
  guidance: string;
}

export interface EssayQuestion extends QuestionBase {
  type: 'essay';
  answer: { modelAnswer: string; maxScore: number; rubric: RubricItem[] };
}

export interface ClozeBlank {
  id: string;
  acceptedAnswers: string[];
  normalization?: Normalization;
}

export interface ClozeQuestion extends QuestionBase {
  type: 'cloze';
  blanks: ClozeBlank[];
}

export interface TextItem {
  id: string;
  text: string;
}

export interface OrderingQuestion extends QuestionBase {
  type: 'ordering';
  items: TextItem[];
  answer: { orderedIds: string[] };
}

export interface MatchingQuestion extends QuestionBase {
  type: 'matching';
  left: TextItem[];
  right: TextItem[];
  answer: { pairs: { leftId: string; rightId: string }[] };
}

// ---- extended types ----

export interface NumericQuestion extends QuestionBase {
  type: 'numeric';
  answer: { value: number; tolerance?: number; relativeTolerance?: number; unit?: string };
}

export interface ClozeSelectBlank {
  id: string;
  options: TextItem[];
  answerOptionId: string;
}
export interface ClozeSelectQuestion extends QuestionBase {
  type: 'cloze_select';
  blanks: ClozeSelectBlank[];
}

export interface Statement {
  id: string;
  text: string;
  value: boolean;
  explanation?: string;
}
export interface StatementSetQuestion extends QuestionBase {
  type: 'statement_set';
  statements: Statement[];
}

export interface CategorizeQuestion extends QuestionBase {
  type: 'categorize';
  categories: { id: string; label: string }[];
  items: { id: string; text: string; categoryId: string }[];
}

export interface TwoTierQuestion extends QuestionBase {
  type: 'two_tier';
  choices: Choice[];
  reasons: Choice[];
  answer: { choiceId: string; reasonId: string };
}

export interface RecallCardQuestion extends QuestionBase {
  type: 'recall_card';
  back: string;
  answer?: { acceptedAnswers?: string[]; normalization?: Normalization };
}

export interface Step {
  id: string;
  prompt: string;
  acceptedAnswers: string[];
  normalization?: Normalization;
  explanation?: string;
}
export interface StepwiseQuestion extends QuestionBase {
  type: 'stepwise';
  steps: Step[];
}

export interface HighlightQuestion extends QuestionBase {
  type: 'highlight';
  segments: TextItem[];
  answer: { segmentIds: string[] };
}

export type Question =
  | SingleChoiceQuestion
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | ShortAnswerQuestion
  | EssayQuestion
  | ClozeQuestion
  | OrderingQuestion
  | MatchingQuestion
  | NumericQuestion
  | ClozeSelectQuestion
  | StatementSetQuestion
  | CategorizeQuestion
  | TwoTierQuestion
  | RecallCardQuestion
  | StepwiseQuestion
  | HighlightQuestion;

export interface DeckMeta {
  id: string;
  title: string;
  description?: string;
  subject: string;
  language: string;
  tags: string[];
}

export interface QuestionBatch {
  schemaVersion: '1.0.0';
  deck: DeckMeta;
  questions: Question[];
}

export const SCHEMA_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// Public (answer-key-free) projections used by Study/Exam screens.
// ---------------------------------------------------------------------------

export type PublicQuestion =
  | (Omit<SingleChoiceQuestion, 'answer'> & { answer?: undefined })
  | (Omit<MultipleChoiceQuestion, 'answer'> & { answer?: undefined })
  | (Omit<TrueFalseQuestion, 'answer'> & { answer?: undefined })
  | (Omit<ShortAnswerQuestion, 'answer'> & { answer?: undefined })
  | (Omit<EssayQuestion, 'answer'> & { answer: { maxScore: number } })
  | (Omit<ClozeQuestion, 'blanks'> & { blanks: { id: string }[] })
  | (Omit<OrderingQuestion, 'answer'> & { answer?: undefined })
  | (Omit<MatchingQuestion, 'answer'> & { answer?: undefined })
  | (Omit<NumericQuestion, 'answer'> & { answer: { unit?: string } })
  | (Omit<ClozeSelectQuestion, 'blanks'> & { blanks: { id: string; options: TextItem[] }[] })
  | (Omit<StatementSetQuestion, 'statements'> & { statements: { id: string; text: string }[] })
  | (Omit<CategorizeQuestion, 'items'> & { items: { id: string; text: string }[] })
  | (Omit<TwoTierQuestion, 'answer'> & { answer?: undefined })
  | (Omit<RecallCardQuestion, 'back' | 'answer'> & { back?: undefined; answer?: undefined; hasAcceptedAnswers: boolean })
  | (Omit<StepwiseQuestion, 'steps'> & { steps: { id: string; prompt: string }[] })
  | (Omit<HighlightQuestion, 'answer'> & { answer?: undefined });

// ---------------------------------------------------------------------------
// Answer payloads submitted by the learner (candidate answers).
// ---------------------------------------------------------------------------

export type AnswerPayload =
  | { type: 'single_choice'; choiceId: string | null }
  | { type: 'multiple_choice'; choiceIds: string[] }
  | { type: 'true_false'; value: boolean | null }
  | { type: 'short_answer'; text: string }
  | { type: 'essay'; text: string; selfScores?: number[] }
  | { type: 'cloze'; blanks: Record<string, string> }
  | { type: 'ordering'; orderedIds: string[] }
  | { type: 'matching'; pairs: { leftId: string; rightId: string | null }[] }
  | { type: 'numeric'; value: number | null }
  | { type: 'cloze_select'; blanks: Record<string, string> }
  | { type: 'statement_set'; values: Record<string, boolean | null> }
  | { type: 'categorize'; assignments: Record<string, string> }
  | { type: 'two_tier'; choiceId: string | null; reasonId: string | null }
  | { type: 'recall_card'; text?: string; selfCorrect?: boolean | null }
  | { type: 'stepwise'; answers: Record<string, string> }
  | { type: 'highlight'; segmentIds: string[] };

export interface GradeDetail {
  /** Per-element verdicts for rich feedback (ids depend on the type). */
  parts?: { id: string; correct: boolean; expected?: string | string[]; given?: string | null }[];
  /** For multiple choice / matching / ordering / cloze: proportion of parts correct (0..1). Never used for auto-pass. */
  partialRatio?: number;
  /** For essay: self-assessed score when provided. */
  selfScore?: number;
  maxScore?: number;
  note?: string;
}

export interface GradeResult {
  /** null = not objectively gradable (essay) or nothing submitted */
  isCorrect: boolean | null;
  gradable: boolean;
  detail: GradeDetail;
}
