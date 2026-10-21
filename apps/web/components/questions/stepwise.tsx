'use client';
import { Check, Lock, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { Input } from '@/components/ui/input';
import { isComposing } from '@/lib/shortcuts/manager';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'stepwise' }>;

/** Chained sub-questions revealed one at a time; grading per step shows where understanding breaks. Order is content, so no shuffle. */
export function Stepwise({ question, value, onChange, onSubmit, phase, grade, answerKey, readOnly }: RendererProps<Q>) {
  const answers = value?.type === 'stepwise' ? value.answers : {};
  const revealed = phase !== 'answering';
  const [unlocked, setUnlocked] = useState(1);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { if (!revealed && !readOnly) inputs.current[0]?.focus(); }, [revealed, readOnly, question.id]);
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const key = new Map((((answerKey?.steps as { id: string; acceptedAnswers: string[]; explanation?: string }[] | undefined) ?? []).map((s) => [s.id, s])));
  const visible = revealed ? question.steps.length : unlocked;
  return (
    <ol className="space-y-2" data-testid="stepwise-list">
      {question.steps.map((s, i) => {
        const p = parts.get(s.id);
        const locked = i >= visible;
        return (
          <li key={s.id} className={cn('rounded-md border px-3 py-2', locked ? 'border-dashed border-line opacity-60' : revealed ? (p?.correct ? 'border-ok bg-ok-soft/50' : 'border-bad bg-bad-soft/50') : 'border-line bg-elevated')}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded bg-muted text-[12px] font-semibold tabular text-ink-2">{i + 1}</span>
              <div className="min-w-0 flex-1">
                {locked ? <div className="flex items-center gap-1 text-sm text-ink-3"><Lock className="h-3.5 w-3.5" /> 이전 단계를 먼저 답하세요</div> : <Markdown className="prose-sm">{s.prompt}</Markdown>}
                {!locked && !revealed ? (
                  <Input ref={(el) => { inputs.current[i] = el; }} value={answers[s.id] ?? ''} disabled={readOnly} aria-label={`${i + 1}단계 답`} className="mt-1.5 h-9 max-w-md" autoComplete="off"
                    onChange={(e) => onChange({ type: 'stepwise', answers: { ...answers, [s.id]: e.target.value } })}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !isComposing(e.nativeEvent)) { e.preventDefault(); if (i + 1 < question.steps.length) { setUnlocked((u) => Math.max(u, i + 2)); setTimeout(() => inputs.current[i + 1]?.focus(), 10); } else onSubmit(); } }} />
                ) : null}
                {revealed ? (
                  <div className={cn('mt-1 flex flex-wrap items-center gap-1 text-[13px] font-medium', p?.correct ? 'text-ok-ink' : 'text-bad-ink')}>
                    {p?.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    <span>입력: {answers[s.id] || '—'}</span>
                    {!p?.correct ? <span className="font-normal text-ink-2">· 정답: {key.get(s.id)?.acceptedAnswers.join(' / ')}</span> : null}
                    {key.get(s.id)?.explanation ? <span className="font-normal text-ink-2">— <Markdown inline className="prose-inherit">{key.get(s.id)!.explanation!}</Markdown></span> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
      {!revealed ? <p className="text-[12px] text-ink-3">Enter: 다음 단계 열기 · 마지막 단계에서 Enter: 제출</p> : null}
    </ol>
  );
}
