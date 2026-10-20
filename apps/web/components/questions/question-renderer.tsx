'use client';
import { useEffect } from 'react';
import type { RendererProps } from './types';
import { SingleChoice } from './single-choice';
import { MultipleChoice } from './multiple-choice';
import { TrueFalse } from './true-false';
import { ShortAnswer } from './short-answer';
import { Essay } from './essay';
import { Cloze } from './cloze';
import { Ordering } from './ordering';
import { Matching } from './matching';
import { Numeric } from './numeric';
import { ClozeSelect } from './cloze-select';
import { StatementSet } from './statement-set';
import { Categorize } from './categorize';
import { TwoTier } from './two-tier';
import { RecallCard } from './recall-card';
import { Stepwise } from './stepwise';
import { Highlight } from './highlight';
import { ClozeBank } from './cloze-bank';
import { CodeCloze } from './code-cloze';
import { Matrix } from './matrix';
import { NumericGrid } from './numeric-grid';
import { ListAnswer } from './list-answer';
import { ImageHotspot } from './image-hotspot';
import { Parsons } from './parsons';
import { FindAndFix } from './find-and-fix';
import { CoordinatePoint } from './coordinate-point';
import { RegexAnswer } from './regex-answer';
import { Markdown } from './markdown';
import { MetaChip } from './masked-chip';
import type { MetaControl } from './meta-mask';
import { TYPE_LABEL } from '@/lib/utils';

/**
 * The prompt leads; type, difficulty, tags and any caller-supplied card facts follow as one quiet meta line.
 * `meta` (study screen) turns difficulty (with the time estimate) and tags into mask toggles; see `MetaChip`.
 */
export function QuestionPrompt({ question, hidePrompt, extra, meta }: { question: RendererProps['question']; hidePrompt?: boolean; extra?: React.ReactNode; meta?: MetaControl }) {
  const tags = question.tags.slice(0, 4);
  return (
    <div className="min-w-0">
      {!hidePrompt && question.type !== 'cloze' && question.type !== 'cloze_select' && question.type !== 'cloze_bank' ? <Markdown className="text-[1.125rem] md:text-[1.2rem] leading-relaxed">{question.prompt}</Markdown> : null}
      <div className={question.type === 'cloze' || question.type === 'cloze_bank' || hidePrompt ? 'flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3' : 'mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3'}>
        <span className="font-medium text-ink-2">{TYPE_LABEL[question.type] ?? question.type}</span>
        <MetaChip k="difficulty" label="난이도" control={meta} testId="meta-difficulty">
          <span>난이도 {question.difficulty}/5</span>
          {question.estimatedSeconds ? <span className="ml-3">약 {question.estimatedSeconds}초</span> : null}
        </MetaChip>
        {tags.length ? (
          <MetaChip k="tags" label="태그" control={meta} testId="meta-tags">
            {tags.map((t, i) => <span key={t} className={i ? 'ml-3' : undefined} data-testid="meta-tag">#{t}</span>)}
          </MetaChip>
        ) : null}
        {extra}
      </div>
    </div>
  );
}

export function QuestionRenderer(props: RendererProps) {
  const { registerDigitHandler } = props;
  useEffect(() => () => registerDigitHandler?.(null), [registerDigitHandler]);
  switch (props.question.type) {
    case 'single_choice':
      return <SingleChoice {...(props as RendererProps<Extract<RendererProps['question'], { type: 'single_choice' }>>)} />;
    case 'multiple_choice':
      return <MultipleChoice {...(props as RendererProps<Extract<RendererProps['question'], { type: 'multiple_choice' }>>)} />;
    case 'true_false':
      return <TrueFalse {...(props as RendererProps<Extract<RendererProps['question'], { type: 'true_false' }>>)} />;
    case 'short_answer':
      return <ShortAnswer {...(props as RendererProps<Extract<RendererProps['question'], { type: 'short_answer' }>>)} />;
    case 'essay':
      return <Essay {...(props as RendererProps<Extract<RendererProps['question'], { type: 'essay' }>>)} />;
    case 'cloze':
      return <Cloze {...(props as RendererProps<Extract<RendererProps['question'], { type: 'cloze' }>>)} />;
    case 'ordering':
      return <Ordering {...(props as RendererProps<Extract<RendererProps['question'], { type: 'ordering' }>>)} />;
    case 'matching':
      return <Matching {...(props as RendererProps<Extract<RendererProps['question'], { type: 'matching' }>>)} />;
    case 'numeric':
      return <Numeric {...(props as RendererProps<Extract<RendererProps['question'], { type: 'numeric' }>>)} />;
    case 'cloze_select':
      return <ClozeSelect {...(props as RendererProps<Extract<RendererProps['question'], { type: 'cloze_select' }>>)} />;
    case 'statement_set':
      return <StatementSet {...(props as RendererProps<Extract<RendererProps['question'], { type: 'statement_set' }>>)} />;
    case 'categorize':
      return <Categorize {...(props as RendererProps<Extract<RendererProps['question'], { type: 'categorize' }>>)} />;
    case 'two_tier':
      return <TwoTier {...(props as RendererProps<Extract<RendererProps['question'], { type: 'two_tier' }>>)} />;
    case 'recall_card':
      return <RecallCard {...(props as RendererProps<Extract<RendererProps['question'], { type: 'recall_card' }>>)} />;
    case 'stepwise':
      return <Stepwise {...(props as RendererProps<Extract<RendererProps['question'], { type: 'stepwise' }>>)} />;
    case 'highlight':
      return <Highlight {...(props as RendererProps<Extract<RendererProps['question'], { type: 'highlight' }>>)} />;
    case 'cloze_bank':
      return <ClozeBank {...(props as RendererProps<Extract<RendererProps['question'], { type: 'cloze_bank' }>>)} />;
    case 'code_cloze':
      return <CodeCloze {...(props as RendererProps<Extract<RendererProps['question'], { type: 'code_cloze' }>>)} />;
    case 'matrix':
      return <Matrix {...(props as RendererProps<Extract<RendererProps['question'], { type: 'matrix' }>>)} />;
    case 'numeric_grid':
      return <NumericGrid {...(props as RendererProps<Extract<RendererProps['question'], { type: 'numeric_grid' }>>)} />;
    case 'list_answer':
      return <ListAnswer {...(props as RendererProps<Extract<RendererProps['question'], { type: 'list_answer' }>>)} />;
    case 'image_hotspot':
      return <ImageHotspot {...(props as RendererProps<Extract<RendererProps['question'], { type: 'image_hotspot' }>>)} />;
    case 'parsons':
      return <Parsons {...(props as RendererProps<Extract<RendererProps['question'], { type: 'parsons' }>>)} />;
    case 'find_and_fix':
      return <FindAndFix {...(props as RendererProps<Extract<RendererProps['question'], { type: 'find_and_fix' }>>)} />;
    case 'coordinate_point':
      return <CoordinatePoint {...(props as RendererProps<Extract<RendererProps['question'], { type: 'coordinate_point' }>>)} />;
    case 'regex_answer':
      return <RegexAnswer {...(props as RendererProps<Extract<RendererProps['question'], { type: 'regex_answer' }>>)} />;
  }
}
