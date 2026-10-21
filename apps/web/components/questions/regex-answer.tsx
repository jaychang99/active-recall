'use client';
import { focusAnswerInput } from '@/lib/answer-focus';
import { Check, Minus, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { compileSafeRegex, testRegexExamples, type PublicQuestion } from '@recall/contracts';
import { Input } from '@/components/ui/input';
import { isComposing } from '@/lib/shortcuts/manager';
import { cn } from '@/lib/utils';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'regex_answer' }>;

/** Write a regex that matches every positive and no negative example. The examples are the question, so they are
 *  public and checked live while typing (same safe compiler as the server); the model pattern appears after grading. */
export function RegexAnswer({ question, value, onChange, onSubmit, phase, grade, answerKey, readOnly }: RendererProps<Q>) {
  const pattern = value?.type === 'regex_answer' ? value.pattern : '';
  const revealed = phase !== 'answering';
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!revealed && !readOnly) focusAnswerInput(ref.current); }, [revealed, readOnly, question.id]);
  const { shouldMatch, shouldNotMatch, flags = '', fullMatch = false } = question.answer;
  const live = compileSafeRegex(pattern, flags, fullMatch);
  const results = pattern ? testRegexExamples(live, shouldMatch, shouldNotMatch) : [];
  const byId = new Map(results.map((r) => [r.id, r]));
  const serverParts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const model = (answerKey?.answer as { modelPattern?: string } | undefined)?.modelPattern;

  const row = (id: string, text: string, expectMatch: boolean) => {
    const r = byId.get(id);
    const sp = serverParts.get(id);
    const ok = revealed ? sp?.correct ?? null : r ? r.correct : null;
    return (
      <li key={id} className={cn('flex items-center gap-2 rounded px-2 py-1 font-mono text-[13px]', ok === true && 'bg-ok-soft/60 text-ok-ink', ok === false && 'bg-bad-soft/60 text-bad-ink')}>
        {ok === true ? <Check className="h-3.5 w-3.5 shrink-0" /> : ok === false ? <X className="h-3.5 w-3.5 shrink-0" /> : <Minus className="h-3.5 w-3.5 shrink-0 text-ink-3" />}
        <span className="min-w-0 break-all">{JSON.stringify(text)}</span>
        <span className="ml-auto shrink-0 font-sans text-[11px] text-ink-3">{expectMatch ? '일치해야 함' : '일치하면 안 됨'}</span>
      </li>
    );
  };

  return (
    <div className="space-y-3" data-testid="regex-answer">
      <div className="flex items-center gap-2">
        <span className="font-mono text-ink-3">/</span>
        <Input ref={ref} value={pattern} disabled={revealed || readOnly} placeholder="정규식 패턴 (JavaScript 문법)" aria-label="정규식" autoComplete="off" spellCheck={false} className="h-11 font-mono text-[15px]"
          onChange={(e) => onChange({ type: 'regex_answer', pattern: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && !isComposing(e.nativeEvent)) { e.preventDefault(); onSubmit(); } }} />
        <span className="font-mono text-ink-3">/{flags}</span>
      </div>
      <p className="text-[12px] text-ink-3">
        {fullMatch ? '문자열 전체가 일치해야 합니다 (^…$ 자동 적용).' : '부분 일치(검색) 기준입니다.'} 길이 200자 이하, 중첩 한정자·역참조 불가.
        {pattern && live.error ? <span className="ml-1 text-bad-ink">패턴 오류: {live.error}</span> : null}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[12px] font-semibold text-ink-3">일치해야 하는 예시</div>
          <ul className="space-y-0.5">{shouldMatch.map((t, i) => row(`match-${i + 1}`, t, true))}</ul>
        </div>
        <div>
          <div className="mb-1 text-[12px] font-semibold text-ink-3">일치하면 안 되는 예시</div>
          <ul className="space-y-0.5">{shouldNotMatch.map((t, i) => row(`reject-${i + 1}`, t, false))}</ul>
        </div>
      </div>
      {revealed ? (
        <div className="rounded-md border border-line bg-muted/60 px-3 py-2 text-sm">
          <div className={cn('flex items-center gap-2 font-medium', grade?.isCorrect ? 'text-ok-ink' : 'text-bad-ink')}>
            {grade?.isCorrect ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            {grade?.isCorrect ? '모든 예시 통과' : `${(grade?.detail.parts ?? []).filter((p) => p.correct).length}/${shouldMatch.length + shouldNotMatch.length} 예시 통과`}
            {grade?.detail.note ? <span className="font-normal text-ink-2">· {grade.detail.note}</span> : null}
          </div>
          {model ? <div className="mt-1 text-ink-2">모범 패턴: <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[13px]">/{model}/{flags}</code></div> : null}
        </div>
      ) : null}
    </div>
  );
}
