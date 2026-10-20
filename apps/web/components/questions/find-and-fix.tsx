'use client';
import { Check, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PublicQuestion } from '@recall/contracts';
import { Input } from '@/components/ui/input';
import { isComposing } from '@/lib/shortcuts/manager';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
import type { RendererProps } from './types';

type Q = Extract<PublicQuestion, { type: 'find_and_fix' }>;

/** Select the wrong segment(s) and type the corrected value for each. Segment order is the passage, never shuffled.
 *  Digits 1-9 toggle the first nine segments; Enter in the last correction input submits. */
export function FindAndFix({ question, value, onChange, onSubmit, phase, grade, answerKey, showKeyHints, readOnly, registerDigitHandler }: RendererProps<Q>) {
  const fixes = value?.type === 'find_and_fix' ? value.fixes : [];
  const revealed = phase !== 'answering';
  const disabled = revealed || !!readOnly;
  const selected = new Map(fixes.map((f) => [f.segmentId, f.text]));
  const parts = new Map((grade?.detail.parts ?? []).map((p) => [p.id, p]));
  const expected = new Map((((answerKey?.answer as { fixes?: { segmentId: string; acceptedAnswers: string[] }[] } | undefined)?.fixes ?? []).map((f) => [f.segmentId, f.acceptedAnswers])));
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const toggle = (id: string) => {
    if (disabled) return;
    const next = selected.has(id) ? fixes.filter((f) => f.segmentId !== id) : [...fixes, { segmentId: id, text: '' }];
    onChange({ type: 'find_and_fix', fixes: next });
    if (!selected.has(id)) setTimeout(() => inputs.current[id]?.focus(), 10);
  };
  const setText = (id: string, text: string) => onChange({ type: 'find_and_fix', fixes: fixes.map((f) => (f.segmentId === id ? { ...f, text } : f)) });
  useEffect(() => { registerDigitHandler?.((n) => { const seg = question.segments[n - 1]; if (seg) toggle(seg.id); }); });
  const ordered = question.segments.filter((s) => selected.has(s.id));

  return (
    <div className="space-y-3">
      {!revealed ? <p className="text-[12px] text-ink-3">틀린 조각을 클릭(또는 1–9 키)해 선택한 뒤, 아래에서 고친 값을 입력하세요.</p> : null}
      <p className="prose-q leading-[2.1]" data-testid="find-fix-passage">
        {question.segments.map((s, i) => {
          const chosen = selected.has(s.id);
          const isAns = expected.has(s.id);
          const p = parts.get(s.id);
          const state = !revealed ? (chosen ? 'sel' : 'idle') : isAns && p?.correct ? 'hit' : isAns && chosen ? 'located' : isAns ? 'missed' : chosen ? 'wrong' : 'idle';
          return (
            <button key={s.id} type="button" aria-pressed={chosen} disabled={disabled} onClick={() => toggle(s.id)} data-segment-id={s.id}
              className={cn('mx-0.5 rounded px-1 py-0.5 text-left font-mono text-[0.95em] transition-colors disabled:cursor-default', state === 'idle' && 'hover:bg-muted', state === 'sel' && 'bg-accent-soft text-accent-soft-ink ring-1 ring-accent', state === 'hit' && 'bg-ok-soft text-ok-ink ring-1 ring-ok', state === 'located' && 'bg-warn-soft text-warn-ink ring-1 ring-warn', state === 'missed' && 'bg-ok-soft/50 text-ok-ink ring-1 ring-dashed ring-ok', state === 'wrong' && 'bg-bad-soft text-bad-ink line-through ring-1 ring-bad')}>
              {showKeyHints && i < 9 && !revealed ? <sup className="mr-0.5 font-sans text-[10px] text-ink-3">{i + 1}</sup> : null}{s.text}
            </button>
          );
        })}
      </p>
      {ordered.length ? (
        <ul className="space-y-1.5" data-testid="find-fix-inputs">
          {ordered.map((s, i) => {
            const p = parts.get(s.id);
            const isAns = expected.has(s.id);
            return (
              <li key={s.id} className={cn('grid items-center gap-2 rounded-md border px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,1fr)]', revealed ? (p?.correct ? 'border-ok bg-ok-soft/50' : 'border-bad bg-bad-soft/50') : 'border-line bg-elevated')}>
                <span className="min-w-0 truncate font-mono text-[13px] text-ink-2"><span className="mr-1 text-ink-3">원문:</span>{s.text}</span>
                <div className="flex min-w-0 items-center gap-2">
                  <Input ref={(el) => { inputs.current[s.id] = el; }} value={selected.get(s.id) ?? ''} disabled={disabled} aria-label={`${s.text} 고친 값`} placeholder="고친 값" autoComplete="off" spellCheck={false} className="h-9 font-mono text-[13px]"
                    onChange={(e) => setText(s.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !isComposing(e.nativeEvent)) { e.preventDefault(); const next = ordered[i + 1]; if (next) inputs.current[next.id]?.focus(); else onSubmit(); } }} />
                  {revealed ? (p?.correct ? <Check className="h-4 w-4 shrink-0 text-ok" /> : <X className="h-4 w-4 shrink-0 text-bad" />) : null}
                </div>
                {revealed && !p?.correct ? <div className="text-[12px] text-ink-2 sm:col-span-2">{isAns ? <>정답: <Markdown inline className="prose-sm">{expected.get(s.id)?.[0] ?? ''}</Markdown></> : '이 조각은 틀린 곳이 아닙니다'}</div> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {revealed ? (
        <div className="text-[12px] text-ink-3">
          초록 = 찾고 고침 · 노랑 = 찾았지만 수정 오류 · 점선 = 놓침 · 빨강 취소선 = 틀린 곳 아님{grade?.detail.note ? ` · ${grade.detail.note}` : ''}
          {[...expected.entries()].filter(([id]) => !selected.has(id)).map(([id, acc]) => <div key={id} className="text-ink-2">놓친 조각 <code className="rounded bg-muted px-1">{question.segments.find((s) => s.id === id)?.text}</code> → {acc[0]}</div>)}
        </div>
      ) : null}
    </div>
  );
}
