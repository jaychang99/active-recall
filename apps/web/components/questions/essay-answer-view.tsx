'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fragment, useCallback } from 'react';
import { toast } from 'sonner';
import type { ModelAnswerSegment, RubricItem } from '@recall/contracts';
import { api, type EssayAnswerView, type Settings } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSettings } from '@/components/layout/settings-context';
import { circledLabel } from './cloze-blanks';
import { Markdown } from './markdown';

export const ESSAY_VIEW_LABEL: Record<EssayAnswerView, string> = { plain: '기본', scored: '문장별 배점' };

/**
 * The essay model-answer view, read from (and written straight back to) the user's settings, so a switch made while
 * studying sticks until the next change. Optimistic like the metadata mask: a failed save rolls back and toasts.
 */
export function useEssayAnswerView() {
  const qc = useQueryClient();
  const { settings } = useSettings();
  const view: EssayAnswerView = settings.essayAnswerView === 'scored' ? 'scored' : 'plain';
  const { mutate } = useMutation({
    mutationFn: (v: EssayAnswerView) => api<Settings>('/settings', { method: 'PATCH', json: { essayAnswerView: v } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['settings'] });
      const prev = qc.getQueryData<Settings>(['settings']);
      qc.setQueryData<Settings>(['settings'], (s) => (s ? { ...s, essayAnswerView: v } : s));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['settings'], ctx.prev);
      toast.error('모범답안 보기 설정을 저장하지 못했습니다', { description: e.message });
    },
    onSuccess: (s) => qc.setQueryData(['settings'], s),
  });
  const setView = useCallback((v: EssayAnswerView) => mutate(v), [mutate]);
  const toggle = useCallback(() => {
    const current = qc.getQueryData<Settings>(['settings'])?.essayAnswerView ?? view;
    const next: EssayAnswerView = current === 'scored' ? 'plain' : 'scored';
    mutate(next);
    toast(`모범답안: ${ESSAY_VIEW_LABEL[next]} 보기`, { description: '설정에 저장되어 다음에도 유지됩니다.' });
  }, [mutate, qc, view]);
  return { view, setView, toggle };
}

/** True when the question carries usable scored segments (older batches don't). */
export function hasScoredSegments(segments: ModelAnswerSegment[] | undefined): segments is ModelAnswerSegment[] {
  return !!segments?.some((g) => g.points !== undefined && g.rubricIndex !== undefined);
}

/** Leading/trailing whitespace is rendered outside the Markdown (which would trim it); trailing newlines become breaks. */
function splitText(text: string) {
  const lead = /^[ \t]/.test(text);
  const tail = /\s*$/.exec(text)?.[0] ?? '';
  const newlines = (tail.match(/\n/g) ?? []).length;
  return { lead, body: text.trim(), newlines, trailingSpace: tail.length > 0 && newlines === 0 };
}

/** The model answer read along sentence by sentence: scored pieces are highlighted with their points and rubric number. */
export function ScoredModelAnswer({ segments, rubric }: { segments: ModelAnswerSegment[]; rubric: RubricItem[] }) {
  return (
    <div className="text-[0.9375rem] leading-[1.95]" data-testid="essay-scored-answer">
      {segments.map((g, i) => {
        const { lead, body, newlines, trailingSpace } = splitText(g.text);
        const scored = g.points !== undefined && g.rubricIndex !== undefined;
        const criterion = scored ? rubric[g.rubricIndex!]?.criterion : undefined;
        const label = scored ? `+${g.points}점 · ${circledLabel(g.rubricIndex!)} ${criterion ?? ''}${g.note ? ` — ${g.note}` : ''}` : undefined;
        return (
          <Fragment key={i}>
            {lead ? ' ' : null}
            {scored ? (
              <span className="rounded-sm bg-accent-soft/70 px-0.5 underline decoration-accent/50 decoration-2 underline-offset-4 [box-decoration-break:clone]" data-segment-points={g.points} title={label}>
                <Markdown inline className="prose-inherit">{body}</Markdown>
                <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-accent/40 bg-elevated px-1.5 align-[0.1em] text-[11px] font-semibold leading-[1.5] text-accent-soft-ink no-underline" aria-label={label}>
                  +{g.points}점<span aria-hidden className="text-[15px] font-medium leading-none">{circledLabel(g.rubricIndex!)}</span>
                </span>
              </span>
            ) : (
              <Markdown inline className="prose-inherit">{body}</Markdown>
            )}
            {newlines >= 2 ? <span className="block h-2" aria-hidden /> : newlines === 1 ? <br /> : trailingSpace ? ' ' : null}
          </Fragment>
        );
      })}
    </div>
  );
}

/** Points each rubric criterion receives from the scored segments (criteria without segments apply to the answer as a whole). */
export function segmentPointsByCriterion(segments: ModelAnswerSegment[] | undefined): Map<number, number> {
  const out = new Map<number, number>();
  for (const g of segments ?? []) if (g.points !== undefined && g.rubricIndex !== undefined) out.set(g.rubricIndex, (out.get(g.rubricIndex) ?? 0) + g.points);
  return out;
}

/** Model answer section with the 기본 / 문장별 배점 switch. Without segments the scored view falls back to the text and says so. */
export function EssayModelAnswer({ modelAnswer, segments, rubric, view, onViewChange }: { modelAnswer: string; segments?: ModelAnswerSegment[]; rubric: RubricItem[]; view: EssayAnswerView; onViewChange: (v: EssayAnswerView) => void }) {
  const supported = hasScoredSegments(segments);
  const showScored = view === 'scored' && supported;
  return (
    <section className="rounded-md border border-line bg-muted/60 p-3" data-testid="essay-model-answer" data-view={showScored ? 'scored' : 'plain'}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-ink-2">모범답안</h4>
        <div role="radiogroup" aria-label="모범답안 보기" className="inline-flex rounded-md border border-line bg-sunken p-0.5" data-testid="essay-view-switch">
          {(['plain', 'scored'] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} data-view={v} onClick={() => onViewChange(v)} className={cn('h-6 rounded px-2 text-[12px] font-medium transition-colors', view === v ? 'bg-elevated text-ink shadow-[inset_0_0_0_1px_var(--line)]' : 'text-ink-3 hover:text-ink')}>
              {ESSAY_VIEW_LABEL[v]}{v === 'scored' && !supported ? <span className="ml-1 text-[10px] font-normal text-ink-3">미지원</span> : null}
            </button>
          ))}
        </div>
      </div>
      {view === 'scored' && !supported ? <p className="mb-1.5 text-[12px] text-ink-3" data-testid="essay-scored-unsupported">이 문항에는 문장별 배점 데이터가 없어 기본 보기로 표시합니다. 새 프롬프트로 생성한 서술형부터 지원합니다.</p> : null}
      {showScored && segments ? <ScoredModelAnswer segments={segments} rubric={rubric} /> : <Markdown className="prose-sm">{modelAnswer}</Markdown>}
    </section>
  );
}
