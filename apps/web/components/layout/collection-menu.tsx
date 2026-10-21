'use client';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, FolderTree, Layers } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api, type Deck, type SubjectSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

export function CollectionMenu({ kind, onNavigate }: { kind: 'decks' | 'subjects'; onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams();
  const label = kind === 'decks' ? '덱' : '과목';
  const Icon = kind === 'decks' ? Layers : FolderTree;
  const subjectView = pathname === '/decks' && search.has('subject');
  const active = kind === 'decks' ? pathname.startsWith('/decks') && !subjectView : pathname.startsWith('/subjects') || subjectView;
  const id = `sidebar-${kind}`;
  // Share the lists and invalidations used by the collection pages and study screen.
  const query = useQuery<(Deck | SubjectSummary)[]>({
    queryKey: [kind],
    queryFn: () => kind === 'decks' ? api<Deck[]>('/decks') : api<SubjectSummary[]>('/subjects'),
    enabled: open,
  });
  const recent = (query.data ?? [])
    .filter((item) => item.lastReviewedAt && !item.archivedAt)
    .sort((a, b) => Date.parse(b.lastReviewedAt!) - Date.parse(a.lastReviewedAt!))
    .slice(0, 5);

  return (
    <div>
      <button
        type="button"
        id={`${id}-toggle`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={cn('flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors', active ? 'bg-elevated font-medium text-ink shadow-[inset_0_0_0_1px_var(--line)]' : 'text-ink-2 hover:bg-muted hover:text-ink')}
      >
        <Icon className="h-4 w-4 shrink-0 text-ink-3" />
        <span>{label}</span>
        <ChevronDown aria-hidden className={cn('ml-auto h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      <div id={id} hidden={!open} className="my-1 ml-[18px] border-l border-line pl-3" aria-labelledby={`${id}-toggle`}>
        <Link href={`/${kind}`} onClick={onNavigate} aria-current={pathname === `/${kind}` && !subjectView ? 'page' : undefined} className="block rounded-md px-2 py-2 text-[13px] font-medium text-ink-2 hover:bg-muted hover:text-ink">
          전체 {label} 보기
        </Link>
        <p className="px-2 pt-2 pb-1 text-[11px] text-ink-3">최근 복습</p>
        {query.isPending ? <p role="status" className="px-2 py-2 text-[12px] text-ink-3">불러오는 중…</p> : null}
        {query.isError ? <div className="px-2 py-2 text-[12px] text-ink-3"><p>최근 항목을 불러오지 못했습니다.</p><button type="button" className="mt-1 text-accent hover:underline" onClick={() => void query.refetch()}>다시 시도</button></div> : null}
        {query.isSuccess && !recent.length ? <p className="px-2 py-2 text-[12px] text-ink-3">아직 복습한 {label}이 없습니다.</p> : null}
        <ul aria-label={`최근 복습한 ${label}`}>
          {recent.map((item) => {
            const name = 'title' in item ? item.title : item.name;
            const href = 'title' in item ? `/decks/${item.id}` : `/decks?subject=${encodeURIComponent(item.name)}`;
            const selected = 'title' in item ? pathname === href : subjectView && search.get('subject') === item.name;
            return (
              <li key={item.id}>
                <Link href={href} onClick={onNavigate} title={name} aria-current={selected ? 'page' : undefined} className={cn('block truncate rounded-md px-2 py-2 text-[13px] transition-colors', selected ? 'bg-accent-soft font-medium text-accent-soft-ink' : 'text-ink-2 hover:bg-muted hover:text-ink')}>
                  {name}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
