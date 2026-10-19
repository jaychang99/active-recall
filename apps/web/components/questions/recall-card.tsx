'use client';
import { Check, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'recall_card' }>;

/** Front/back flashcard. Typed answer is auto-graded only when accepted answers exist; otherwise the learner self-checks. */
export function RecallCard({ question, value, onChange, onSubmit, phase, grade, answerKey, readOnly }: RendererProps<Q>) {
  const text = value?.type === 'recall_card' ? (value.text ?? '') : '';
  const selfCorrect = value?.type === 'recall_card' ? value.selfCorrect : undefined;
  const revealed = phase !== 'answering';
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!revealed && !readOnly) ref.current?.focus(); }, [revealed, readOnly]);
  const back = (answerKey as { back?: string } | undefined)?.back ?? '';
  const auto = question.hasAcceptedAnswers;
  const accepted = ((answerKey?.answer as { acceptedAnswers?: string[] } | undefined)?.acceptedAnswers ?? []) as string[];
  return (
    <div className="space-y-3">
      {!revealed ? (
        <>
          <Textarea ref={ref} value={text} disabled={readOnly} rows={3} placeholder={auto ? '답을 입력하고 ⌘/Ctrl+Enter 로 제출 (Space: 바로 뒷면 보기)' : '떠올린 내용을 적어두면 뒷면과 비교하기 좋습니다 (선택). Space: 뒷면 보기'} aria-label="회상 답안" className="text-base"
            onChange={(e) => onChange({ type: 'recall_card', text: e.target.value, selfCorrect })}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit(); } }} />
          <p className="text-[12px] text-ink-3">{auto ? '인정 답안과 문자열 비교로 자동 채점됩니다.' : '자동 채점 없음 — 뒷면을 보고 스스로 맞았는지 표시합니다.'}</p>
        </>
      ) : (
        <>
          {text ? <div className="rounded-md border border-line bg-muted/40 p-3 text-sm"><div className="mb-1 text-[11px] text-ink-3">내 답</div><div className="whitespace-pre-wrap">{text}</div></div> : null}
          <div className="rounded-md border border-accent/40 bg-accent-soft/30 p-3" data-testid="card-back">
            <div className="mb-1 text-[11px] text-accent-soft-ink">뒷면</div>
            <Markdown>{back}</Markdown>
          </div>
          {auto ? (
            <div className="text-sm">
              {grade?.isCorrect ? <span className="flex items-center gap-1 font-medium text-ok-ink"><Check className="h-4 w-4" /> 정답</span> : <span className="flex items-center gap-1 font-medium text-bad-ink"><X className="h-4 w-4" /> 오답</span>}
              <div className="text-ink-2">인정 답안: {accepted.join(' / ')}</div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="자기 확인" data-testid="self-check">
              <span className="text-[13px] text-ink-2">떠올렸나요?</span>
              {([true, false] as const).map((b) => (
                <button key={String(b)} type="button" role="radio" aria-checked={selfCorrect === b} disabled={readOnly} onClick={() => onChange({ type: 'recall_card', text, selfCorrect: b })}
                  className={cn('inline-flex h-8 items-center gap-1 rounded-md border px-3 text-sm font-medium', selfCorrect === b ? (b ? 'border-ok bg-ok-soft text-ok-ink' : 'border-bad bg-bad-soft text-bad-ink') : 'border-line text-ink-2 hover:border-line-strong')}>
                  {b ? <><Check className="h-3.5 w-3.5" /> 맞음</> : <><X className="h-3.5 w-3.5" /> 틀림</>}
                </button>
              ))}
              <span className="text-[12px] text-ink-3">(통계의 자동채점 분모에는 들어가지 않습니다)</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
