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
import { Markdown } from './markdown';
import { TYPE_LABEL } from '@/lib/utils';

/** The prompt leads; type, difficulty, tags and any caller-supplied card facts follow as one quiet meta line. */
export function QuestionPrompt({ question, hidePrompt, extra }: { question: RendererProps['question']; hidePrompt?: boolean; extra?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      {!hidePrompt && question.type !== 'cloze' && question.type !== 'cloze_select' ? <Markdown className="text-[1.125rem] md:text-[1.2rem] leading-relaxed">{question.prompt}</Markdown> : null}
      <div className={question.type === 'cloze' || hidePrompt ? 'flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3' : 'mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3'}>
        <span className="font-medium text-ink-2">{TYPE_LABEL[question.type] ?? question.type}</span>
        <span>난이도 {question.difficulty}/5</span>
        {question.tags.slice(0, 4).map((t) => <span key={t}>#{t}</span>)}
        {question.estimatedSeconds ? <span>약 {question.estimatedSeconds}초</span> : null}
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
  }
}
