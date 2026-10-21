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
  | 'highlight'
  // extended set 2 (additive)
  | 'cloze_bank'
  | 'code_cloze'
  | 'matrix'
  | 'numeric_grid'
  | 'list_answer'
  | 'image_hotspot'
  | 'parsons'
  | 'find_and_fix'
  | 'coordinate_point'
  | 'regex_answer';

export const CORE_QUESTION_TYPES: readonly QuestionType[] = ['single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay', 'cloze', 'ordering', 'matching'] as const;
export const EXTENDED_QUESTION_TYPES: readonly QuestionType[] = ['numeric', 'cloze_select', 'statement_set', 'categorize', 'two_tier', 'recall_card', 'stepwise', 'highlight'] as const;
export const EXTENDED2_QUESTION_TYPES: readonly QuestionType[] = ['cloze_bank', 'code_cloze', 'matrix', 'numeric_grid', 'list_answer', 'image_hotspot', 'parsons', 'find_and_fix', 'coordinate_point', 'regex_answer'] as const;
export const QUESTION_TYPES: readonly QuestionType[] = [...CORE_QUESTION_TYPES, ...EXTENDED_QUESTION_TYPES, ...EXTENDED2_QUESTION_TYPES];

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

/** One consecutive piece of the model answer. Scored pieces carry points for one rubric criterion (0-based index). */
export interface ModelAnswerSegment {
  text: string;
  points?: number;
  rubricIndex?: number;
  note?: string;
}

export interface EssayQuestion extends QuestionBase {
  type: 'essay';
  /** modelAnswerSegments is optional (added later): older batches have only the plain modelAnswer. */
  answer: { modelAnswer: string; maxScore: number; rubric: RubricItem[]; modelAnswerSegments?: ModelAnswerSegment[] };
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

// ---- extended set 2 ----

export interface ClozeBankQuestion extends QuestionBase {
  type: 'cloze_bank';
  /** Shared word bank (may contain distractors); each item fills at most one blank. */
  bank: TextItem[];
  blanks: { id: string; bankItemId: string }[];
}

export interface CodeClozeQuestion extends QuestionBase {
  type: 'code_cloze';
  language: string;
  /** Source code with `{{id}}` placeholders. */
  code: string;
  blanks: ClozeBlank[];
}

export interface MatrixQuestion extends QuestionBase {
  type: 'matrix';
  rows: TextItem[];
  columns: TextItem[];
  /** `multiple` (default): any number of cells per row; `single`: exactly one column per row. */
  selection?: 'multiple' | 'single';
  answer: { cells: { rowId: string; columnId: string }[] };
}

export interface NumericGridCell {
  id: string;
  rowId: string;
  columnId: string;
  value: number;
  tolerance?: number;
  relativeTolerance?: number;
}
export interface NumericGridQuestion extends QuestionBase {
  type: 'numeric_grid';
  rows: { id: string; label: string }[];
  columns: { id: string; label: string }[];
  cells: NumericGridCell[];
  /** Pre-filled cells shown as-is. */
  given?: { rowId: string; columnId: string; text: string }[];
  unit?: string;
}

export interface ListAnswerItem {
  id: string;
  acceptedAnswers: string[];
  normalization?: Normalization;
}
export interface ListAnswerQuestion extends QuestionBase {
  type: 'list_answer';
  answer: { items: ListAnswerItem[]; required?: number };
}

export type HotspotShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'polygon'; points: [number, number][] };
export interface HotspotRegion {
  id: string;
  label?: string;
  shape: HotspotShape;
}
export interface HotspotImage {
  url?: string;
  svg?: string;
  alt: string;
}
export interface ImageHotspotQuestion extends QuestionBase {
  type: 'image_hotspot';
  image: HotspotImage;
  /** Normalized (0..1) regions; never sent to the client before grading. */
  regions: HotspotRegion[];
  answer: { regionIds: string[] };
}

export interface CodeLine {
  id: string;
  /** One line without leading indentation. */
  code: string;
}
export interface ParsonsQuestion extends QuestionBase {
  type: 'parsons';
  language?: string;
  lines: CodeLine[];
  distractors?: CodeLine[];
  /** default true */
  checkIndent?: boolean;
  answer: { lines: { id: string; indent: number }[] };
}

export interface FindAndFixQuestion extends QuestionBase {
  type: 'find_and_fix';
  segments: TextItem[];
  answer: { fixes: { segmentId: string; acceptedAnswers: string[]; normalization?: Normalization }[] };
}

export interface CoordinatePlane {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xStep?: number;
  yStep?: number;
  xLabel?: string;
  yLabel?: string;
  snap?: boolean;
}
export interface CoordinatePointQuestion extends QuestionBase {
  type: 'coordinate_point';
  plane: CoordinatePlane;
  answer: { points: { id: string; x: number; y: number; tolerance?: number; label?: string }[] };
}

export interface RegexAnswerQuestion extends QuestionBase {
  type: 'regex_answer';
  answer: { shouldMatch: string[]; shouldNotMatch: string[]; flags?: string; fullMatch?: boolean; modelPattern?: string };
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
  | HighlightQuestion
  | ClozeBankQuestion
  | CodeClozeQuestion
  | MatrixQuestion
  | NumericGridQuestion
  | ListAnswerQuestion
  | ImageHotspotQuestion
  | ParsonsQuestion
  | FindAndFixQuestion
  | CoordinatePointQuestion
  | RegexAnswerQuestion;

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
  | (Omit<HighlightQuestion, 'answer'> & { answer?: undefined })
  | (Omit<ClozeBankQuestion, 'blanks'> & { blanks: { id: string }[] })
  | (Omit<CodeClozeQuestion, 'blanks'> & { blanks: { id: string }[] })
  | (Omit<MatrixQuestion, 'answer'> & { answer?: undefined })
  | (Omit<NumericGridQuestion, 'cells'> & { cells: { id: string; rowId: string; columnId: string }[] })
  | (Omit<ListAnswerQuestion, 'answer'> & { answer: { count: number } })
  | (Omit<ImageHotspotQuestion, 'regions' | 'answer'> & { regions?: undefined; answer: { count: number } })
  | (Omit<ParsonsQuestion, 'lines' | 'distractors' | 'answer'> & { lines?: undefined; distractors?: undefined; answer?: undefined; blocks: CodeLine[] })
  | (Omit<FindAndFixQuestion, 'answer'> & { answer?: undefined })
  | (Omit<CoordinatePointQuestion, 'answer'> & { answer: { count: number } })
  | (Omit<RegexAnswerQuestion, 'answer'> & { answer: { shouldMatch: string[]; shouldNotMatch: string[]; flags?: string; fullMatch?: boolean } });

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
  | { type: 'highlight'; segmentIds: string[] }
  | { type: 'cloze_bank'; blanks: Record<string, string> }
  | { type: 'code_cloze'; blanks: Record<string, string> }
  | { type: 'matrix'; cells: { rowId: string; columnId: string }[] }
  | { type: 'numeric_grid'; values: Record<string, number | null> }
  | { type: 'list_answer'; entries: string[] }
  | { type: 'image_hotspot'; points: { x: number; y: number }[] }
  | { type: 'parsons'; lines: { id: string; indent: number }[] }
  | { type: 'find_and_fix'; fixes: { segmentId: string; text: string }[] }
  | { type: 'coordinate_point'; points: { x: number; y: number }[] }
  | { type: 'regex_answer'; pattern: string };

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
