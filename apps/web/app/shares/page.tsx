'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Send } from 'lucide-react';
import Link from '@/components/ui/navigation-link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { api, type ReceivedShare, type SentShare, type ShareSummary } from '@/lib/api';
import { KIND_LABEL, SHARE_STATUS as STATUS } from '@/components/shares/labels';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, tabPanelProps } from '@/components/ui/tabs';
import { EmptyState, ErrorState, PageHeader, Panel, LoadingState } from '@/components/ui/misc';
import { formatDate } from '@/lib/utils';


export default function SharesPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = sp.get('tab') === 'sent' ? 'sent' : 'received';
  const received = useQuery({ queryKey: ['shares', 'received'], queryFn: () => api<ReceivedShare[]>('/shares/received'), enabled: tab === 'received' });
  const sent = useQuery({ queryKey: ['shares', 'sent'], queryFn: () => api<SentShare[]>('/shares/sent'), enabled: tab === 'sent' });
  const pending = received.data?.filter((s) => s.status === 'pending').length ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="공유" description="이메일로 덱·과목·문항을 주고받습니다. 받은 공유를 수락하면 내 계정에 복사본이 생기고, 학습은 처음부터 시작합니다." />
      <Tabs
        className="mb-4"
        idPrefix="shares"
        value={tab}
        onChange={(k) => router.replace(k === 'sent' ? '/shares?tab=sent' : '/shares')}
        items={[
          { key: 'received', label: <><Inbox className="h-4 w-4" /> 받은 공유</>, badge: pending ? <Badge tone="accent">{pending}</Badge> : undefined },
          { key: 'sent', label: <><Send className="h-4 w-4" /> 보낸 공유</> },
        ]}
      />
      <div {...tabPanelProps('shares', tab)}>{tab === 'received' ? <ReceivedList q={received} /> : <SentList q={sent} />}</div>
    </div>
  );
}

function Meta({ s }: { s: ShareSummary }) {
  return (
    <span className="text-[12px] text-ink-3">
      {KIND_LABEL[s.kind]} · {s.deckCount > 1 ? `덱 ${s.deckCount}개 · ` : ''}문항 {s.questionCount}개 · {formatDate(s.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
      {s.status === 'pending' ? ` · ${formatDate(s.expiresAt)}까지` : ''}
    </span>
  );
}

function ResultLinks({ s }: { s: ShareSummary }) {
  if (!s.resultJson?.decks.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
      {s.resultJson.decks.map((d) => (
        <Link key={d.id} href={`/decks/${d.id}`} className="rounded-full border border-line px-2 py-0.5 text-ink-2 hover:border-line-strong hover:text-ink">
          {d.title} <span className="text-ink-3">+{d.created}{d.updated ? ` · 갱신 ${d.updated}` : ''}</span>
        </Link>
      ))}
    </div>
  );
}

function ReceivedList({ q }: { q: ReturnType<typeof useQuery<ReceivedShare[]>> }) {
  const qc = useQueryClient();
  const decline = useMutation({
    mutationFn: (id: string) => api(`/shares/received/${id}/decline`, { method: 'POST' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['shares'] }); toast.success('공유를 거절했습니다'); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isLoading) return <LoadingState label="공유 목록을 불러오는 중…" className="min-h-40" />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState icon={<Inbox className="h-5 w-5" />} title="받은 공유가 없습니다" body="누군가 내 이메일로 덱이나 과목을 공유하면 여기에 나타납니다." />;
  return (
    <ul className="space-y-2" data-testid="received-shares">
      {q.data.map((s) => (
        <li key={s.id}>
          <Panel className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/shares/${s.id}`} className="font-medium hover:underline">{s.title}</Link>
                  <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                </div>
                <div className="mt-0.5 text-[13px] text-ink-2">보낸 사람: {s.sender.name ? `${s.sender.name} · ` : ''}{s.sender.email}</div>
                <Meta s={s} />
                {s.message ? <p className="mt-2 border-l-2 border-line pl-3 text-[13px] whitespace-pre-wrap text-ink-2">{s.message}</p> : null}
                <ResultLinks s={s} />
              </div>
              {s.status === 'pending' ? (
                <div className="flex gap-2">
                  <Link href={`/shares/${s.id}`}><Button variant="primary" size="sm">살펴보고 수락</Button></Link>
                  <Button loading={decline.isPending} size="sm" variant="ghost" disabled={decline.isPending} onClick={() => { if (confirm(`"${s.title}" 공유를 거절할까요?`)) decline.mutate(s.id); }}>거절</Button>
                </div>
              ) : null}
            </div>
          </Panel>
        </li>
      ))}
    </ul>
  );
}

function SentList({ q }: { q: ReturnType<typeof useQuery<SentShare[]>> }) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/shares/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['shares', 'sent'] }); toast.success('공유를 취소했습니다'); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isLoading) return <LoadingState label="공유 목록을 불러오는 중…" className="min-h-40" />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState icon={<Send className="h-5 w-5" />} title="보낸 공유가 없습니다" body="덱 상세나 과목 화면의 공유 버튼으로 다른 사람에게 보낼 수 있습니다." />;
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm" data-testid="sent-shares">
        <thead className="text-left text-[12px] text-ink-3">
          <tr className="border-b border-line"><th className="px-3 py-2 font-normal">내용</th><th className="px-3 py-2 font-normal">받는 사람</th><th className="px-3 py-2 font-normal">상태</th><th className="px-3 py-2 font-normal whitespace-nowrap">보낸 날</th><th className="px-3 py-2" /></tr>
        </thead>
        <tbody>
          {q.data.map((s) => (
            <tr key={s.id} className="border-b border-line last:border-0">
              <td className="px-3 py-2"><div className="font-medium">{s.title}</div><div className="text-[12px] text-ink-3">{KIND_LABEL[s.kind]} · 문항 {s.questionCount}개</div></td>
              <td className="px-3 py-2 text-ink-2">{s.recipientEmail}</td>
              <td className="px-3 py-2 whitespace-nowrap"><Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>{s.respondedAt && s.status !== 'pending' ? <div className="mt-0.5 text-[11px] text-ink-3">{formatDate(s.respondedAt)}</div> : null}</td>
              <td className="px-3 py-2 text-[13px] whitespace-nowrap text-ink-3">{formatDate(s.createdAt)}</td>
              <td className="px-3 py-2 text-right">{s.status === 'pending' ? <Button loading={cancel.isPending} size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => { if (confirm(`${s.recipientEmail}에게 보낸 공유를 취소할까요?`)) cancel.mutate(s.id); }}>취소</Button> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
