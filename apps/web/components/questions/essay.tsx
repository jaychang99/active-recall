'use client';
import { focusAnswerInput } from '@/lib/answer-focus';
import { useEffect, useRef } from 'react';
import type { EssayQuestion, PublicQuestion } from '@recall/contracts';
import { Textarea } from '@/components/ui/input';
import { circledLabel } from './cloze-blanks';
import { EssayModelAnswer, hasScoredSegments, segmentPointsByCriterion, useEssayAnswerView } from './essay-answer-view';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'essay' }>;

export function Essay({ question, value, onChange, onSubmit, phase, answerKey, readOnly }: RendererProps<Q>) {
  const text = value?.type === 'essay' ? value.text : '';
  const selfScores = value?.type === 'essay' ? value.selfScores : undefined;
  const revealed = phase !== 'answering';
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!revealed && !readOnly) focusAnswerInput(ref.current);
  }, [revealed, readOnly]);
  const key = answerKey?.answer as Partial<EssayQuestion['answer']> | undefined;
  const rubric = key?.rubric ?? [];
  const { view, setView } = useEssayAnswerView();
  const scored = view === 'scored' && hasScoredSegments(key?.modelAnswerSegments);
  const segmentPoints = segmentPointsByCriterion(key?.modelAnswerSegments);
  const total = (selfScores ?? []).reduce((a, b) => a + (b || 0), 0);
  return (
    <div className="space-y-3">
      <Textarea
        ref={ref}
        value={text}
        disabled={revealed || readOnly}
        rows={6}
        placeholder="자유롭게 서술하세요. ⌘/Ctrl+Enter 로 제출 (Enter는 줄바꿈)"
        aria-label="서술형 답안"
        className="text-base"
        onChange={(e) => onChange({ type: 'essay', text: e.target.value, selfScores })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      {!revealed ? <p className="text-[12px] text-ink-3">서술형은 자동 채점되지 않습니다. 제출 후 모범답안과 루브릭으로 직접 채점합니다. 최대 {question.answer.maxScore}점</p> : null}
      {revealed && key ? (
        <div className="space-y-3">
          <EssayModelAnswer modelAnswer={key.modelAnswer ?? ''} segments={key.modelAnswerSegments} rubric={rubric} view={view} onViewChange={setView} />
          <section className="rounded-md border border-line p-3" data-testid="rubric">
            <div className="mb-2 flex items-baseline justify-between">
              <h4 className="text-[13px] font-semibold text-ink-2">루브릭 자기평가</h4>
              <span className="text-sm tabular"><span className="font-semibold">{total}</span> / {key.maxScore}점</span>
            </div>
            <ul className="space-y-2.5">
              {rubric.map((r, i) => (
                <li key={r.criterion} className="grid gap-1 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="text-sm font-medium">{scored ? <span className="mr-1 text-accent-soft-ink" aria-hidden>{circledLabel(i)}</span> : null}<Markdown inline className="prose-sm">{r.criterion}</Markdown> <span className="text-ink-3">({r.maxPoints}점{scored ? (segmentPoints.has(i) ? ` · 문장 배점 ${segmentPoints.get(i)}점` : ' · 답안 전체에 적용') : ''})</span></div>
                    <Markdown className="prose-sm text-[13px] text-ink-2">{r.guidance}</Markdown>
                  </div>
                  <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`${r.criterion} 점수`}>
                    {Array.from({ length: r.maxPoints + 1 }, (_, p) => (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={(selfScores?.[i] ?? 0) === p}
                        disabled={readOnly}
                        onClick={() => {
                          const next = rubric.map((_, j) => selfScores?.[j] ?? 0);
                          next[i] = p;
                          onChange({ type: 'essay', text, selfScores: next });
                        }}
                        className={`h-7 min-w-7 rounded border px-1.5 text-[13px] tabular ${(selfScores?.[i] ?? 0) === p ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-elevated text-ink-2 hover:border-line-strong'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </div>
  );
}
