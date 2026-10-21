'use client';
import { focusAnswerInput } from '@/lib/answer-focus';
import { Check, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { Input } from '@/components/ui/input';
import { Markdown } from './markdown';
import { isComposing } from '@/lib/shortcuts/manager';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'short_answer' }>;

export function ShortAnswer({ value, onChange, onSubmit, phase, grade, answerKey, readOnly }: RendererProps<Q>) {
  const text = value?.type === 'short_answer' ? value.text : '';
  const revealed = phase !== 'answering';
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!revealed && !readOnly) focusAnswerInput(ref.current);
  }, [revealed, readOnly]);
  const accepted = ((answerKey?.answer as { acceptedAnswers?: string[] } | undefined)?.acceptedAnswers ?? []) as string[];
  const correct = grade?.isCorrect ?? null;
  return (
    <div className="space-y-2">
      <Input
        ref={ref}
        value={text}
        disabled={revealed || readOnly}
        placeholder="정답을 입력하고 Enter"
        aria-label="단답형 답안"
        autoComplete="off"
        className="h-11 text-base"
        onChange={(e) => onChange({ type: 'short_answer', text: e.target.value })}
        onKeyDown={(e) => {
          // Enter submits — but never mid-IME composition (Korean).
          if (e.key === 'Enter' && !isComposing(e.nativeEvent) && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      {revealed ? (
        <div className="rounded-md border border-line bg-muted/60 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 font-medium">
            {correct === true ? <><Check className="h-4 w-4 text-ok" /> <span className="text-ok-ink">정답</span></> : correct === false ? <><X className="h-4 w-4 text-bad" /> <span className="text-bad-ink">오답</span></> : null}
            {text ? <span className="text-ink-3">· 입력: <span className="text-ink">{text}</span></span> : <span className="text-ink-3">· 입력 없음</span>}
          </div>
          <div className="mt-1 text-ink-2">인정 답안: {accepted.map((a) => <code key={a} className="mr-1 rounded bg-elevated px-1.5 py-0.5 text-[13px]">{a}</code>)}</div>
          {accepted.some((a) => a.includes('$')) ? <div className="mt-1 text-ink-2">수식 표기: {accepted.map((a) => <Markdown key={a} inline className="mr-2">{a}</Markdown>)}</div> : null}
          <p className="mt-1 text-[12px] text-ink-3">문자열 정규화(공백·대소문자·NFKC) 후 정확히 일치해야 자동 정답입니다. 의미상 맞다면 평가 단계에서 직접 판단하세요.</p>
        </div>
      ) : null}
    </div>
  );
}
