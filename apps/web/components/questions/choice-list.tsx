'use client';
import { Check, X } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
import { STRUCK_TEXT, StrikeButton, type Strikes } from './strikes';

export interface ChoiceView {
  id: string;
  text: string;
  explanation?: string;
  selected: boolean;
  /** After reveal: whether this choice is part of the correct answer. */
  correct: boolean | null;
  index: number;
}

/**
 * Shared list for single/multiple choice. Color is always paired with an icon + text label.
 * With `strikes` each option gets a strike toggle (also right-click on the option): a view-only "ruled out" mark.
 * Choosing a struck option clears its mark.
 */
export function ChoiceList({ choices, multiple, onToggle, disabled, showKeyHints, revealed, compact, strikes }: {
  choices: ChoiceView[];
  multiple: boolean;
  onToggle: (id: string) => void;
  disabled: boolean;
  showKeyHints: boolean;
  revealed: boolean;
  compact?: boolean;
  strikes?: Strikes;
}) {
  const canStrike = !!strikes?.enabled; // also while the list waits on another step (two_tier reasons)
  // However an option gets chosen (click, digit key), choosing it takes back the "ruled out" mark.
  const chosenStruck = canStrike ? choices.filter((c) => c.selected && strikes!.has(c.id)).map((c) => c.id) : [];
  useEffect(() => { chosenStruck.forEach((id) => strikes?.unstrike(id)); }, [chosenStruck.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ul role={multiple ? 'group' : 'radiogroup'} className="space-y-2" data-testid="choice-list">
      {choices.map((c) => {
        const state = !revealed ? (c.selected ? 'selected' : 'idle') : c.correct ? (c.selected ? 'hit' : 'missed') : c.selected ? 'wrong' : 'idle';
        const struck = canStrike && !c.selected && strikes!.has(c.id);
        return (
          <li key={c.id} className={canStrike ? 'group relative' : undefined}>
            <button
              type="button"
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={c.selected}
              disabled={disabled}
              onClick={() => onToggle(c.id)}
              onContextMenu={canStrike ? (e) => { e.preventDefault(); strikes!.toggle(c.id); } : undefined}
              data-choice-id={c.id}
              data-state={state}
              data-struck={struck || undefined}
              className={cn(
                'flex w-full items-start gap-3 rounded-md border px-3 text-left transition-colors disabled:cursor-default',
                compact ? 'py-2' : 'py-2.5',
                canStrike && 'pr-12',
                struck && 'border-dashed',
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
              <span className={cn('min-w-0 flex-1', struck && STRUCK_TEXT)}>
                <Markdown className="prose-sm">{c.text}</Markdown>
                {revealed && c.explanation ? <span className="mt-1 block text-[13px] leading-relaxed text-ink-2"><Markdown className="prose-inherit">{c.explanation}</Markdown></span> : null}
              </span>
              {revealed ? (
                <span className={cn('ml-2 flex shrink-0 items-center gap-1 text-[12px] font-medium', state === 'hit' || state === 'missed' ? 'text-ok-ink' : state === 'wrong' ? 'text-bad-ink' : 'text-transparent')}>
                  {state === 'hit' ? <><Check className="h-3.5 w-3.5" /> 정답</> : state === 'missed' ? <><Check className="h-3.5 w-3.5" /> 정답(미선택)</> : state === 'wrong' ? <><X className="h-3.5 w-3.5" /> 오답</> : null}
                </span>
              ) : null}
            </button>
            {canStrike ? <StrikeButton struck={struck} onToggle={() => strikes!.toggle(c.id)} label={`${c.index + 1}번 보기`} className={cn('absolute right-2', compact ? 'top-1.5' : 'top-2')} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
