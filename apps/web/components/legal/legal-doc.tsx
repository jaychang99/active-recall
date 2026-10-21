import Link from '@/components/ui/navigation-link';
import { Wordmark } from '@/components/layout/shell';
import { cn } from '@/lib/utils';

/** Operator details shared by the privacy policy and the terms. Change here, both pages follow. */
export const OPERATOR = {
  service: 'Recall Studio',
  url: 'https://ar.jaychang99.dev',
  name: 'Jaewon Chang',
  email: 'jaychang99@gmail.com',
} as const;

export function ContactEmail() {
  return <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>;
}

/** Bare, signed-out-readable document page for the privacy policy and the terms. */
export function LegalDoc({ title, effective, summary, children }: { title: string; effective: string; summary?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <Link href="/" className="rounded-md"><Wordmark /></Link>
        <nav className="flex gap-4 text-sm text-ink-3" aria-label="정책 문서">
          <Link href="/terms" className="hover:text-ink">이용약관</Link>
          <Link href="/privacy" className="hover:text-ink">개인정보처리방침</Link>
        </nav>
      </header>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-ink-3">시행일 {effective}</p>
      {summary ? <div className="mt-6 rounded-lg border border-line bg-sunken/60 px-5 py-4 text-sm leading-relaxed text-ink-2">{summary}</div> : null}
      <div
        className={cn(
          'mt-8 space-y-10 text-[15px] leading-relaxed text-ink-2',
          '[&_h2]:mb-3 [&_h2]:scroll-mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink',
          '[&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:font-medium [&_h3]:text-ink',
          '[&_p+p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5',
          '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4 [&_strong]:font-semibold [&_strong]:text-ink',
        )}
      >
        {children}
      </div>
      <footer className="mt-12 border-t border-line pt-4 text-sm text-ink-3">
        문의: <ContactEmail /> · <Link href="/" className="hover:text-ink">{OPERATOR.service}로 돌아가기</Link>
      </footer>
    </div>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {children}
    </section>
  );
}

/** Small bordered table for processors / retention periods; scrolls sideways on narrow screens. */
export function DocTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead className="bg-sunken/60 text-ink">
          <tr>{head.map((h) => <th key={h} scope="col" className="border-b border-line px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0 align-top">
              {r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
