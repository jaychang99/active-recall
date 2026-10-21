'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Plus, Trash2 } from 'lucide-react';
import Link from '@/components/ui/navigation-link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, type SubjectSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, PageHeader, Panel, ProgressStrip, LoadingState } from '@/components/ui/misc';
import { ShareDialog } from '@/components/shares/share-dialog';
import { ArchiveButton } from '@/components/decks/archive-button';
import { Tabs, tabPanelProps } from '@/components/ui/tabs';
import { formatDateTime } from '@/lib/utils';

const COLORS = ['#0f766e', '#2458b3', '#9a6400', '#b3261e', '#6b21a8', '#1f7a3a', '#be185d', '#475569'];

export default function SubjectsPage() {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const [tab, setTab] = useState<'active' | 'archived'>(sp.get('tab') === 'archived' ? 'archived' : 'active');
  const archived = tab === 'archived';
  const subjects = useQuery({ queryKey: archived ? ['subjects', 'archived'] : ['subjects'], queryFn: () => api<SubjectSummary[]>(archived ? '/subjects?archived=true' : '/subjects') });
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: (n: string) => api('/subjects', { method: 'POST', json: { name: n, color: COLORS[(subjects.data?.length ?? 0) % COLORS.length] } }),
    onSuccess: () => { setName(''); void qc.invalidateQueries({ queryKey: ['subjects'] }); toast.success('과목을 추가했습니다'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api(`/subjects/${id}`, { method: 'PATCH', json: data }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['subjects'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/subjects/${id}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['subjects'] }); toast.success('과목을 삭제했습니다 (문항은 유지)'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="과목" description="과목은 태그처럼 동작합니다. 한 문항이 여러 과목에 속할 수 있고, 덱의 과목은 가져올 때 자동으로 부여됩니다. 덱 상세에서 문항별로 과목을 추가하세요." />
      <Tabs items={[{ key: 'active', label: '과목' }, { key: 'archived', label: '아카이브' }]} value={tab} onChange={setTab} idPrefix="subjects-archive" className="mb-4" />
      <p className="mb-4 text-[12px] text-ink-3">{archived ? '보관한 과목입니다. 아카이브를 해제하면 기본 목록과 전체 학습 대상에 다시 포함됩니다.' : '마지막으로 복습한 과목부터 표시합니다.'}</p>
      {!archived ? <form className="mb-6 flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(name.trim()); }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="새 과목 이름 (예: 운영체제, 중간고사 범위)" aria-label="새 과목 이름" />
        <Button loading={create.isPending} type="submit" variant="primary" disabled={!name.trim() || create.isPending}><Plus className="h-4 w-4" /> 추가</Button>
      </form> : null}
      <div {...tabPanelProps('subjects-archive', tab)}>
      {subjects.isLoading ? <LoadingState label="과목 목록을 불러오는 중…" className="min-h-40" /> : null}
      {subjects.isError ? <ErrorState message={(subjects.error as Error).message} onRetry={() => subjects.refetch()} /> : null}
      {subjects.isSuccess && subjects.data.length === 0 ? <EmptyState title={archived ? '아카이브한 과목이 없습니다' : '과목이 없습니다'} body={archived ? '과목 카드의 아카이브 버튼으로 보관할 수 있습니다.' : '덱을 가져오면 덱의 과목이 자동으로 생성됩니다.'} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {subjects.data?.map((s) => (
          <Panel key={s.id} className="relative p-4 transition-colors hover:border-line-strong" data-testid="subject-card" data-subject-id={s.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <button type="button" disabled={update.isPending} aria-busy={update.isPending && update.variables?.id === s.id || undefined} aria-label="색상 변경" className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-sunken" onClick={() => update.mutate({ id: s.id, data: { color: COLORS[(COLORS.indexOf(s.color ?? '') + 1) % COLORS.length] } })}>
                  <span className="h-4 w-4 rounded-full border border-line" style={{ background: s.color ?? 'var(--accent)' }} />
                </button>
                <input
                  defaultValue={s.name}
                  aria-label="과목 이름"
                  className="relative z-10 min-w-0 flex-1 truncate bg-transparent font-medium outline-none focus:border-b focus:border-accent"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) update.mutate({ id: s.id, data: { name: v } }); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
              </div>
              <div className="flex shrink-0 gap-1">
                {!archived ? <ArchiveButton kind="subjects" id={s.id} name={s.name} archived={false} /> : null}
                <Button variant="ghost" size="iconSm" className="relative z-10" loading={remove.isPending && remove.variables === s.id} disabled={remove.isPending} aria-label="과목 삭제" onClick={() => { if (confirm(`"${s.name}" 과목을 삭제할까요? 문항은 삭제되지 않습니다.`)) remove.mutate(s.id); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            <Link href={`/decks?subject=${encodeURIComponent(s.name)}`} aria-label={`${s.name} 덱 보기`} className="mt-1 block text-[12px] text-ink-3 after:absolute after:inset-0 after:rounded-lg">{s.questionCount}문항 · 덱 {s.deckIds.length}개 · due {s.progress.dueToday}</Link>
            <p className="mt-1 text-[12px] text-ink-3">마지막 복습 {s.lastReviewedAt ? formatDateTime(s.lastReviewedAt) : '없음'}</p>
            <ProgressStrip p={s.progress} className="mt-3" />
            <div className="relative z-10 mt-3 flex flex-wrap gap-2">
              {archived ? <ArchiveButton kind="subjects" id={s.id} name={s.name} archived showLabel /> : null}
              <Link href={`/study/all?subject=${encodeURIComponent(s.name)}`}><Button size="sm"><Play className="h-3.5 w-3.5 text-accent" /> 예정 학습</Button></Link>
              <Link href={`/study/all?subject=${encodeURIComponent(s.name)}&mode=cram`}><Button size="sm">훑기</Button></Link>
              <Link href={`/insights?subject=${encodeURIComponent(s.name)}`}><Button size="sm" variant="ghost">통계</Button></Link>
              {s.questionCount ? <ShareDialog target={{ kind: 'subject', subjectId: s.id }} name={s.name} count={s.questionCount} size="sm" variant="ghost" /> : null}
            </div>
          </Panel>
        ))}
      </div>
      </div>
    </div>
  );
}
