'use client';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';

export interface ChoiceView {
  id: string;
  text: string;
  explanation?: string;
  selected: boolean;
  /** After reveal: whether this choice is part of the correct answer. */
  correct: boolean | null;
  index: number;
}

/** Shared list for single/multiple choice. Color is always paired with an icon + text label. */
export function ChoiceList({ choices, multiple, onToggle, disabled, showKeyHints, revealed, compact }: {
  choices: ChoiceView[];
  multiple: boolean;
  onToggle: (id: string) => void;
  disabled: boolean;
  showKeyHints: boolean;
  revealed: boolean;
  compact?: boolean;
}) {
  return (
    <ul role={multiple ? 'group' : 'radiogroup'} className="space-y-2" data-testid="choice-list">
      {choices.map((c) => {
        const state = !revealed ? (c.selected ? 'selected' : 'idle') : c.correct ? (c.selected ? 'hit' : 'missed') : c.selected ? 'wrong' : 'idle';
        return (
          <li key={c.id}>
            <button
              type="button"
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={c.selected}
              disabled={disabled}
              onClick={() => onToggle(c.id)}
              data-choice-id={c.id}
              data-state={state}
              className={cn(
                'flex w-full items-start gap-3 rounded-md border px-3 text-left transition-colors disabled:cursor-default',
                compact ? 'py-2' : 'py-2.5',
                state === 'idle' && 'border-line bg-elevated hover:border-line-strong',
                state === 'selected' && 'border-accent bg-accent-soft/60',
                state === 'hit' && 'border-ok bg-ok-soft',
                state === 'missed' && 'border-ok border-dashed bg-ok-soft/40',
                state === 'wrong' && 'border-bad bg-bad-soft',
              )}
            >
              <span className={cn('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded border text-[12px] font-semibold', c.selected ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong text-ink-3', multiple ? 'rounded' : 'rounded-full')}>
                {showKeyHints ? c.index + 1 : c.selected ? <Check className="h-3.5 w-3.5" /> : ''}
              </span>
              <span className="min-w-0 flex-1">
                <Markdown className="prose-sm">{c.text}</Markdown>
                {revealed && c.explanation ? <span className="mt-1 block text-[13px] text-ink-2">{c.explanation}</span> : null}
              </span>
              {revealed ? (
                <span className={cn('ml-2 flex shrink-0 items-center gap-1 text-[12px] font-medium', state === 'hit' || state === 'missed' ? 'text-ok-ink' : state === 'wrong' ? 'text-bad-ink' : 'text-transparent')}>
                  {state === 'hit' ? <><Check className="h-3.5 w-3.5" /> 정답</> : state === 'missed' ? <><Check className="h-3.5 w-3.5" /> 정답(미선택)</> : state === 'wrong' ? <><X className="h-3.5 w-3.5" /> 오답</> : null}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
