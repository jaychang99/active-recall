'use client';
import { AlertTriangle, BookMarked, Check, ListOrdered, X } from 'lucide-react';
import type { GradeResult } from '@recall/contracts';
import type { GradeResponse } from '@/lib/api';
import { Markdown } from '@/components/questions/markdown';
import { MaskedChip } from '@/components/questions/masked-chip';
import { cn } from '@/lib/utils';

export function Verdict({ grade, revealedBeforeAnswer }: { grade: GradeResult | null; revealedBeforeAnswer: boolean }) {
  if (revealedBeforeAnswer) return <div className="flex items-center gap-2 text-sm font-medium text-ink-2" data-testid="verdict" data-verdict="revealed"><BookMarked className="h-4 w-4" /> 정답 공개 (답안 미제출)</div>;
  if (!grade) return null;
  if (grade.isCorrect === null) return <div className="flex items-center gap-2 text-sm font-medium text-ink-2" data-testid="verdict" data-verdict="manual"><BookMarked className="h-4 w-4" /> 자기평가 문항 — 루브릭으로 채점하세요</div>;
  return grade.isCorrect ? (
    <div className="flex items-center gap-2 text-sm font-semibold text-ok-ink" data-testid="verdict" data-verdict="correct"><span className="grid h-6 w-6 place-items-center rounded-full bg-ok text-white"><Check className="h-4 w-4" strokeWidth={3} /></span> 정답</div>
  ) : (
    <div className="flex items-center gap-2 text-sm font-semibold text-bad-ink" data-testid="verdict" data-verdict="incorrect">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-bad text-white"><X className="h-4 w-4" strokeWidth={3} /></span> 오답
      {typeof grade.detail.partialRatio === 'number' ? <span className="font-normal text-ink-3">· 부분 일치 {(grade.detail.partialRatio * 100).toFixed(0)}% (정답 인정 아님)</span> : null}
    </div>
  );
}

export function ExplanationPanel({ explanation, source, sourceMasked, onRevealSource, open, className }: { explanation: GradeResponse['explanation']; source?: { document: string; location?: string; url?: string }; /** Hide the source line behind a masked chip (study metadata mask). */ sourceMasked?: boolean; onRevealSource?: () => void; open: boolean; className?: string }) {
  if (!open) return null;
  return (
    <section className={cn('rounded-lg border border-line bg-elevated p-4 rs-pop', className)} data-testid="explanation" aria-label="해설">
      <h3 className="mb-2 text-[13px] font-semibold text-ink-2">해설</h3>
      <Markdown>{explanation.summary}</Markdown>
      {explanation.steps?.length ? (
        <div className="mt-3">
          <h4 className="mb-1 flex items-center gap-1 text-[13px] font-semibold text-ink-2"><ListOrdered className="h-3.5 w-3.5" /> 풀이 단계</h4>
          <ol className="list-decimal space-y-1 pl-5 text-[15px]">
            {explanation.steps.map((s, i) => <li key={i}><Markdown className="prose-sm">{s}</Markdown></li>)}
          </ol>
        </div>
      ) : null}
      {explanation.misconceptions?.length ? (
        <div className="mt-3">
          <h4 className="mb-1 flex items-center gap-1 text-[13px] font-semibold text-warn-ink"><AlertTriangle className="h-3.5 w-3.5" /> 흔한 오개념</h4>
          <ul className="list-disc space-y-1 pl-5 text-[15px]">
            {explanation.misconceptions.map((s, i) => <li key={i}><Markdown className="prose-sm">{s}</Markdown></li>)}
          </ul>
        </div>
      ) : null}
      {(explanation.references?.length || source) ? (
        <div className="mt-3 text-[12px] text-ink-3">
          {source ? (sourceMasked ? <div><MaskedChip label="출처" onReveal={onRevealSource} testId="meta-source" /></div> : <div data-testid="meta-source">출처: {source.document}{source.location ? ` · ${source.location}` : ''}{source.url ? <> · <a className="underline" href={source.url} target="_blank" rel="noreferrer">링크</a></> : null}</div>) : null}
          {explanation.references?.map((r, i) => <div key={i}>참고: {r.document}{r.location ? ` · ${r.location}` : ''}{r.url ? <> · <a className="underline" href={r.url} target="_blank" rel="noreferrer">링크</a></> : null}</div>)}
        </div>
      ) : null}
    </section>
  );
}
