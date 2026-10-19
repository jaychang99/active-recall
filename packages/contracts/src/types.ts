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
  | 'matching';

export const QUESTION_TYPES: readonly QuestionType[] = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'short_answer',
  'essay',
  'cloze',
  'ordering',
  'matching',
] as const;

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

export type Question =
  | SingleChoiceQuestion
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | ShortAnswerQuestion
  | EssayQuestion
  | ClozeQuestion
  | OrderingQuestion
  | MatchingQuestion;

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
  | (Omit<MatchingQuestion, 'answer'> & { answer?: undefined });

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
  | { type: 'matching'; pairs: { leftId: string; rightId: string | null }[] };

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
