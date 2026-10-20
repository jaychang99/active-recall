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
import { formatDate } from '@/lib/utils';

export default function DecksPage() {
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api<Deck[]>('/decks') });
  const [q, setQ] = useState('');
  const sp = useSearchParams();
  const [subject, setSubject] = useState<string | null>(sp.get('subject'));
  // Subjects are tag-like: a subject also covers decks whose questions carry it, not only decks whose deck subject it is.
  const tagged = useQuery({ queryKey: ['subjects'], queryFn: () => api<SubjectSummary[]>('/subjects'), enabled: !!subject });
  const taggedDeckIds = new Set(tagged.data?.find((s) => s.name === subject)?.deckIds ?? []);
  const subjects = [...new Set([...(decks.data?.map((d) => d.subject) ?? []), ...(subject ? [subject] : [])])].sort();
  const list = (decks.data ?? []).filter((d) => (!subject || d.subject === subject || taggedDeckIds.has(d.id)) && (!q || d.title.toLowerCase().includes(q.toLowerCase()) || d.tags.some((t) => t.includes(q))));
  const grouped = new Map<string, Deck[]>();
  for (const d of list) grouped.set(d.subject, [...(grouped.get(d.subject) ?? []), d]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="덱" description="과목별로 분류된 덱 목록입니다. 각 덱은 가져온 JSON 배치 하나에 대응합니다." actions={<Link href="/import"><Button variant="primary"><Upload className="h-4 w-4" /> JSON 가져오기</Button></Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="덱 제목·태그 검색" aria-label="덱 검색" className="max-w-xs" />
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setSubject(null)} className={`rounded-full border px-3 py-1 text-[13px] ${subject === null ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-line text-ink-2'}`}>전체</button>
          {subjects.map((s) => (
            <button key={s} type="button" onClick={() => setSubject(s)} className={`rounded-full border px-3 py-1 text-[13px] ${subject === s ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-line text-ink-2'}`}>{s}</button>
          ))}
        </div>
      </div>
      {decks.isLoading ? <Skeleton className="h-40" /> : null}
      {decks.isError ? <ErrorState message={(decks.error as Error).message} onRetry={() => decks.refetch()} /> : null}
      {decks.isSuccess && decks.data.length === 0 ? <EmptyState title="덱이 없습니다" body="가져오기 화면에서 LLM이 생성한 JSON을 붙여넣으세요." action={<Link href="/import"><Button variant="primary">가져오기</Button></Link>} /> : null}
      <div className="space-y-8">
        {[...grouped.entries()].map(([s, ds]) => (
          <section key={s}>
            <h2 className="mb-3 text-[13px] font-semibold text-ink-2">{s} <span className="font-normal text-ink-3">· {ds.length}개 덱</span></h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ds.map((d) => (
                <Panel key={d.id} className="relative flex flex-col gap-3 p-4 transition-colors hover:border-line-strong">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/decks/${d.id}`} className="block truncate font-medium after:absolute after:inset-0 after:rounded-lg">{d.title}</Link>
                      <div className="truncate text-[12px] text-ink-3">{d.description || `${d.language} · 수정 ${formatDate(d.updatedAt)}`}</div>
                    </div>
                    {d.progress.dueToday > 0 ? <Badge tone="accent">due {d.progress.dueToday}</Badge> : null}
                  </div>
                  <ProgressStrip p={d.progress} />
                  <div className="flex flex-wrap gap-1">{d.tags.map((t) => <Badge key={t}>{t}</Badge>)}{d.progress.flagged ? <Badge tone="warn">표시 {d.progress.flagged}</Badge> : null}{d.progress.suspended ? <Badge tone="outline">보류 {d.progress.suspended}</Badge> : null}</div>
                  <div className="relative z-10 mt-auto flex gap-2">
                    <Link href={`/study/${d.id}`} className="flex-1"><Button size="sm" className="w-full"><Play className="h-3.5 w-3.5 text-accent" /> 학습</Button></Link>
                    <Link href={`/study/${d.id}?mode=cram`}><Button size="sm">훑기</Button></Link>
                    <Link href={`/exam?deckId=${d.id}`}><Button size="sm">시험</Button></Link>
                  </div>
                </Panel>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
