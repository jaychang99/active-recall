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
import { Markdown } from './markdown';
import { Badge } from '@/components/ui/badge';
import { TYPE_LABEL } from '@/lib/utils';

export function QuestionPrompt({ question, hidePrompt }: { question: RendererProps['question']; hidePrompt?: boolean }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">{TYPE_LABEL[question.type] ?? question.type}</Badge>
        <Badge tone="outline">난이도 {question.difficulty}/5</Badge>
        {question.tags.slice(0, 4).map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
        {question.estimatedSeconds ? <span className="text-[12px] text-ink-3">약 {question.estimatedSeconds}초</span> : null}
      </div>
      {!hidePrompt && question.type !== 'cloze' ? <Markdown className="text-[1.125rem] md:text-[1.2rem] leading-relaxed">{question.prompt}</Markdown> : null}
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
  }
}
