import type { AnswerPayload, GradeResult, PublicQuestion } from '@recall/contracts';

export type Phase = 'answering' | 'submitted' | 'revealed';

export interface RendererProps<Q extends PublicQuestion = PublicQuestion> {
  question: Q;
  /** Current candidate answer (controlled). */
  value: AnswerPayload | null;
  onChange: (v: AnswerPayload) => void;
  /** Called when the renderer wants to submit (Enter inside an input, etc.). */
  onSubmit: () => void;
  phase: Phase;
  /** Server verdict after submit/reveal. */
  grade: GradeResult | null;
  /** Server answer key after submit/reveal. */
  answerKey: Record<string, unknown> | null;
  /** Shuffle seed (stable per attempt) or null to keep authored order. */
  shuffleSeed: string | null;
  /** Whether number-key hints should be shown next to choices. */
  showKeyHints: boolean;
  /** Disable all inputs (exam review etc.). */
  readOnly?: boolean;
  /** Compact layout (exam list). */
  compact?: boolean;
  /** Called with a function that chooses the nth option (1-based) so the study screen can map digit keys. */
  registerDigitHandler?: (fn: ((n: number) => void) | null) => void;
}
