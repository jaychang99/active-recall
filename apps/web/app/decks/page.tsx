'use client';
import { useQuery } from '@tanstack/react-query';
import { Play, Upload } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api, type Deck, type SubjectSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, PageHeader, Panel, ProgressStrip, Skeleton } from '@/components/ui/misc';
import { Tabs, tabPanelProps } from '@/components/ui/tabs';
import { ArchiveButton } from '@/components/decks/archive-button';
import { formatDateTime } from '@/lib/utils';

export default function DecksPage() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<'active' | 'archived'>(sp.get('tab') === 'archived' ? 'archived' : 'active');
  const archived = tab === 'archived';
  const decks = useQuery({ queryKey: archived ? ['decks', 'archived'] : ['decks'], queryFn: () => api<Deck[]>(archived ? '/decks?archived=true' : '/decks') });
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState<string | null>(sp.get('subject'));
  // Archived subjects remain available when following an explicit subject link.
  const tagged = useQuery({ queryKey: ['subjects', 'all'], queryFn: () => api<SubjectSummary[]>('/subjects?includeArchived=true'), enabled: !!subject });
  const taggedDeckIds = new Set(tagged.data?.find((s) => s.name === subject)?.deckIds ?? []);
  const subjects = [...new Set([...(decks.data?.map((d) => d.subject) ?? []), ...(subject ? [subject] : [])])];
  const list = (decks.data ?? []).filter((d) => (!subject || d.subject === subject || taggedDeckIds.has(d.id)) && (!q || d.title.toLowerCase().includes(q.toLowerCase()) || d.tags.some((t) => t.includes(q))));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="덱" description="마지막으로 복습한 덱부터 표시합니다. 과목으로 목록을 좁힐 수 있습니다." actions={<Link href="/import"><Button variant="primary"><Upload className="h-4 w-4" /> JSON 가져오기</Button></Link>} />
      <Tabs items={[{ key: 'active', label: '덱' }, { key: 'archived', label: '아카이브' }]} value={tab} onChange={setTab} idPrefix="decks-archive" className="mb-4" />
      {archived ? <p className="mb-4 text-[12px] text-ink-3">보관한 덱입니다. 아카이브를 해제하면 기본 목록과 전체 학습 대상에 다시 포함됩니다.</p> : null}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="덱 제목·태그 검색" aria-label="덱 검색" className="max-w-xs" />
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setSubject(null)} className={`rounded-full border px-3 py-1 text-[13px] ${subject === null ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-line text-ink-2'}`}>전체</button>
          {subjects.map((s) => (
            <button key={s} type="button" onClick={() => setSubject(s)} className={`rounded-full border px-3 py-1 text-[13px] ${subject === s ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-line text-ink-2'}`}>{s}</button>
          ))}
        </div>
      </div>
      <div {...tabPanelProps('decks-archive', tab)}>
        {decks.isLoading ? <Skeleton className="h-40" /> : null}
        {decks.isError ? <ErrorState message={(decks.error as Error).message} onRetry={() => decks.refetch()} /> : null}
        {decks.isSuccess && list.length === 0 ? <EmptyState title={q || subject ? '조건에 맞는 덱이 없습니다' : archived ? '아카이브한 덱이 없습니다' : '덱이 없습니다'} body={archived ? '덱 카드의 아카이브 버튼으로 보관할 수 있습니다.' : '가져오기 화면에서 LLM이 생성한 JSON을 붙여넣으세요.'} action={!archived && !decks.data.length ? <Link href="/import"><Button variant="primary">가져오기</Button></Link> : undefined} /> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((d) => (
            <Panel key={d.id} className="relative flex flex-col gap-3 p-4 transition-colors hover:border-line-strong" data-testid="deck-card" data-deck-id={d.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/decks/${d.id}`} className="block truncate font-medium after:absolute after:inset-0 after:rounded-lg">{d.title}</Link>
                  <div className="truncate text-[12px] text-ink-3">{d.subject} · {d.language}</div>
                  {d.description ? <div className="truncate text-[12px] text-ink-3">{d.description}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {d.progress.dueToday > 0 ? <Badge tone="accent">due {d.progress.dueToday}</Badge> : null}
                  {!archived ? <ArchiveButton kind="decks" id={d.id} name={d.title} archived={false} /> : null}
                </div>
              </div>
              <p className="text-[12px] text-ink-3">마지막 복습 {d.lastReviewedAt ? formatDateTime(d.lastReviewedAt) : '없음'}</p>
              <ProgressStrip p={d.progress} />
              <div className="flex flex-wrap gap-1">{d.tags.map((t) => <Badge key={t}>{t}</Badge>)}{d.progress.flagged ? <Badge tone="warn">표시 {d.progress.flagged}</Badge> : null}{d.progress.suspended ? <Badge tone="outline">보류 {d.progress.suspended}</Badge> : null}</div>
              <div className="relative z-10 mt-auto flex flex-wrap gap-2">
                {archived ? <ArchiveButton kind="decks" id={d.id} name={d.title} archived showLabel /> : null}
                <Link href={`/study/${d.id}`} className="flex-1"><Button size="sm" className="w-full"><Play className="h-3.5 w-3.5 text-accent" /> 학습</Button></Link>
                <Link href={`/study/${d.id}?mode=cram`}><Button size="sm">훑기</Button></Link>
                <Link href={`/exam?deckId=${d.id}`}><Button size="sm">시험</Button></Link>
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}
