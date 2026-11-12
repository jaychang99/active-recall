import { Flag } from 'lucide-react';

/** Session progress as a little runner jogging along a track toward the finish flag. Decorative: the "n / total 완료" text carries the numbers. */
export function StudyRunner({ done, total }: { done: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  return (
    <div className="mb-3 flex items-end gap-1.5" aria-hidden data-testid="study-runner" data-progress={Math.round(ratio * 100)}>
      <div className="relative h-7 flex-1">
        <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-accent/70 transition-[width] duration-300 ease-out" style={{ width: `${ratio * 100}%` }} />
        </div>
        <div className="absolute bottom-0.5 h-6 w-6 text-accent transition-[left] duration-300 ease-out" style={{ left: `calc((100% - 1.5rem) * ${ratio})` }}>
          <svg viewBox="0 0 24 24" className="rs-runner h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <g className="rs-runner-body">
              <circle cx="15" cy="4.5" r="2.3" fill="currentColor" stroke="none" />
              <path d="M14 8 11.5 14" />
              <path className="rs-runner-arm rs-runner-a" d="M13.5 9.5 16 12l2.2-2" />
              <path className="rs-runner-arm rs-runner-b" d="M13.5 9.5 16 12l2.2-2" />
              <path className="rs-runner-leg rs-runner-a" d="M11.5 14 14 18l-2.2 4" />
              <path className="rs-runner-leg rs-runner-b" d="M11.5 14 14 18l-2.2 4" />
            </g>
          </svg>
        </div>
      </div>
      <Flag className="mb-0.5 h-4 w-4 shrink-0 text-ink-3" />
    </div>
  );
}
