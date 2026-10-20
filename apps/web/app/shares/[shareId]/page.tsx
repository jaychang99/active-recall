'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, type Deck, type ShareDetail, type ShareResultDeck } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select } from '@/components/ui/input';
import { ErrorState, PageHeader, Panel, Skeleton } from '@/components/ui/misc';
import { Markdown } from '@/components/questions/markdown';
import { KIND_LABEL, SHARE_STATUS } from '@/components/shares/labels';
import { TYPE_LABEL, cn, formatDate } from '@/lib/utils';

type Strategy = 'add_only' | 'upsert';
interface Target { mode: 'new' | 'existing'; title: string; deckId: string; strategy: Strategy }

export default function ShareAcceptPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = use(params);
  const share = useQuery({ queryKey: ['share', shareId], queryFn: () => api<ShareDetail>(`/shares/received/${shareId}`) });
  if (share.isLoading) return <div className="mx-auto max-w-4xl space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (share.isError) return <ErrorState message={(share.error as Error).message} onRetry={() => share.refetch()} />;
  return <AcceptForm s={share.data!} />;
}

function AcceptForm({ s }: { s: ShareDetail }) {
  const router = useRouter();
  const qc = useQueryClient();
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api<Deck[]>('/decks') });
  const snap = s.snapshot;
  const multi = snap.decks.length > 1;
  const pending = s.status === 'pending';

  const [layout, setLayout] = useState<'keep' | 'merge'>('keep');
  const [targets, setTargets] = useState<Record<string, Target>>(() => {
    const out: Record<string, Target> = { '*': { mode: 'new', title: s.title, deckId: '', strategy: 'add_only' } };
    snap.decks.forEach((d, i) => {
      // A copy received earlier is the natural home for an updated re-share.
      const prev = s.suggestions.decks[d.originId];
      out[String(i)] = prev ? { mode: 'existing', title: d.title, deckId: prev.id, strategy: 'upsert' } : { mode: 'new', title: d.title, deckId: '', strategy: 'add_only' };
    });
    return out;
  });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [extraSubjects, setExtraSubjects] = useState(true);
  const subjectNames = useMemo(() => {
    const deckSubjects = new Set(snap.decks.map((d) => d.subject));
    const extras = new Set(snap.decks.flatMap((d) => d.questions.flatMap((q) => q.subjects)).filter((n) => !deckSubjects.has(n)));
    return { deck: [...deckSubjects], extra: [...extras] };
  }, [snap]);
  const [subjectMap, setSubjectMap] = useState<Record<string, string>>({});

  const total = snap.decks.reduce((n, d) => n + d.questions.length, 0);
  const chosen = total - excluded.size;
  const groups = layout === 'merge' && multi ? ['*'] : snap.decks.map((_, i) => String(i));
  const incomplete = groups.some((g) => targets[g]!.mode === 'existing' && !targets[g]!.deckId);

  const accept = useMutation({
    mutationFn: () =>
      api<{ decks: ShareResultDeck[] }>(`/shares/received/${s.id}/accept`, {
        method: 'POST',
        json: {
          layout: multi ? layout : 'keep',
          exclude: [...excluded],
          extraSubjects,
          subjectMap: Object.fromEntries(Object.entries(subjectMap).filter(([k, v]) => v.trim() !== k)),
          targets: groups.map((g) => {
            const t = targets[g]!;
            return t.mode === 'new' ? { group: g, mode: 'new', title: t.title.trim() || undefined } : { group: g, mode: 'existing', deckId: t.deckId, strategy: t.strategy };
          }),
        },
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['shares'] });
      void qc.invalidateQueries({ queryKey: ['decks'] });
      void qc.invalidateQueries({ queryKey: ['subjects'] });
      const created = r.decks.reduce((n, d) => n + d.created, 0);
      const updated = r.decks.reduce((n, d) => n + d.updated, 0);
      toast.success('공유를 가져왔습니다', { description: `새 문항 ${created}개${updated ? `, 갱신 ${updated}개` : ''}. 학습은 처음부터 시작합니다.` });
      router.push(r.decks.length === 1 ? `/decks/${r.decks[0]!.id}` : '/decks');
    },
    onError: (e: Error) => toast.error('가져오지 못했습니다', { description: e.message }),
  });
  const decline = useMutation({
    mutationFn: () => api(`/shares/received/${s.id}/decline`, { method: 'POST' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['shares'] }); toast.success('공유를 거절했습니다'); router.push('/shares'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setTarget = (g: string, patch: Partial<Target>) => setTargets((t) => ({ ...t, [g]: { ...t[g]!, ...patch } }));
  const toggle = (keys: string[], on: boolean) => setExcluded((ex) => { const n = new Set(ex); for (const k of keys) { if (on) n.delete(k); else n.add(k); } return n; });

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <Link href="/shares" className="mb-3 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> 공유 목록</Link>
      <PageHeader
        title={s.title}
        description={<>{s.sender.name ? `${s.sender.name} (${s.sender.email})` : s.sender.email}님이 보낸 {KIND_LABEL[s.kind]} · {multi ? `덱 ${snap.decks.length}개 · ` : ''}문항 {total}개 · {formatDate(s.createdAt)}</>}
        actions={<Badge tone={SHARE_STATUS[s.status].tone}>{SHARE_STATUS[s.status].label}</Badge>}
      />
      {s.message ? <Panel className="mb-4 p-4 text-sm whitespace-pre-wrap text-ink-2">{s.message}</Panel> : null}
      {!pending ? (
        <Panel className="mb-4 p-4 text-sm">
          {s.status === 'accepted' ? '이미 수락한 공유입니다.' : s.status === 'expired' ? '수락 기한(30일)이 지났습니다. 보낸 사람에게 다시 보내 달라고 하세요.' : '거절한 공유입니다.'}
          {s.resultJson?.decks.length ? <div className="mt-2 flex flex-wrap gap-2">{s.resultJson.decks.map((d) => <Link key={d.id} href={`/decks/${d.id}`}><Button size="sm">{d.title}</Button></Link>)}</div> : null}
        </Panel>
      ) : null}

      {pending ? (
        <div className="space-y-4">
          {multi ? (
            <Section title="덱 구성">
              <div className="grid gap-2 sm:grid-cols-2">
                {([['keep', `원래 덱 구조 유지 (덱 ${snap.decks.length}개)`, '보낸 사람의 덱 단위 그대로 가져옵니다.'], ['merge', '하나의 덱으로 합치기', '모든 문항을 덱 하나에 넣습니다.']] as const).map(([k, t, d]) => (
                  <button key={k} type="button" aria-pressed={layout === k} onClick={() => setLayout(k)} className={cn('rounded-md border p-3 text-left', layout === k ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-line-strong')} data-testid={`layout-${k}`}>
                    <div className="text-sm font-medium">{t}</div>
                    <div className="mt-0.5 text-[12px] text-ink-3">{d}</div>
                  </button>
                ))}
              </div>
            </Section>
          ) : null}

          <Section title="어디로 가져올까요">
            <div className="space-y-3">
              {groups.map((g) => {
                const t = targets[g]!;
                const source = g === '*' ? null : snap.decks[Number(g)]!;
                const prev = source ? s.suggestions.decks[source.originId] : undefined;
                return (
                  <div key={g} className="rounded-md border border-line p-3" data-testid={`target-${g}`}>
                    <div className="mb-2 text-[13px] font-medium">{source ? source.title : '합친 덱'} <span className="font-normal text-ink-3">· 문항 {source ? source.questions.length : total}개</span>{prev ? <Badge tone="info" className="ml-2">전에 받은 덱: {prev.title}</Badge> : null}</div>
                    <div className="flex flex-wrap items-center gap-3 text-[13px]">
                      <label className="flex items-center gap-1.5"><input type="radio" checked={t.mode === 'new'} onChange={() => setTarget(g, { mode: 'new' })} /> 새 덱</label>
                      <label className="flex items-center gap-1.5"><input type="radio" checked={t.mode === 'existing'} onChange={() => setTarget(g, { mode: 'existing' })} /> 내 덱에 합치기</label>
                    </div>
                    {t.mode === 'new' ? (
                      <div className="mt-2"><Label htmlFor={`title-${g}`} className="block">덱 이름</Label><Input id={`title-${g}`} className="mt-1 max-w-md" value={t.title} maxLength={200} onChange={(e) => setTarget(g, { title: e.target.value })} /></div>
                    ) : (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <Label htmlFor={`deck-${g}`}>합칠 덱</Label>
                          <Select id={`deck-${g}`} className="mt-1 w-full" value={t.deckId} onChange={(e) => setTarget(g, { deckId: e.target.value })}>
                            <option value="">덱 선택…</option>
                            {decks.data?.filter((d) => !d.deletedAt).map((d) => <option key={d.id} value={d.id}>{d.title} · {d.subject}</option>)}
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor={`strategy-${g}`}>이미 있는 문항</Label>
                          <Select id={`strategy-${g}`} className="mt-1 w-full" value={t.strategy} onChange={(e) => setTarget(g, { strategy: e.target.value as Strategy })}>
                            <option value="add_only">그대로 두고 새 문항만 추가</option>
                            <option value="upsert">보낸 내용으로 갱신 (내 학습 기록은 유지)</option>
                          </Select>
                        </div>
                        <p className="text-[12px] text-ink-3 sm:col-span-2">같은 공유에서 온 문항만 &lsquo;이미 있는 문항&rsquo;으로 봅니다. 내가 직접 만든 문항은 ID가 같아도 건드리지 않습니다. 정답이 바뀐 문항은 일정을 처음부터 다시 잡습니다.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="과목">
            <p className="mb-2 text-[12px] text-ink-3">이름을 바꾸거나 내 과목 이름을 입력해 합칠 수 있습니다. 덱의 과목은 새 덱의 과목이 되고, 기존 덱에 합칠 때는 추가 과목으로 붙습니다.</p>
            <datalist id="my-subjects">{s.suggestions.subjects.map((n) => <option key={n} value={n} />)}</datalist>
            <div className="space-y-2">
              {[...subjectNames.deck.map((n) => [n, true] as const), ...(extraSubjects ? subjectNames.extra.map((n) => [n, false] as const) : [])].map(([n, isDeck]) => {
                const v = subjectMap[n] ?? n;
                const mine = s.suggestions.subjects.includes(v.trim());
                return (
                  <div key={n} className="grid items-center gap-2 text-[13px] sm:grid-cols-[minmax(0,14rem)_auto_minmax(0,1fr)]">
                    <span className="truncate">{n} <span className="text-ink-3">{isDeck ? '· 덱 과목' : '· 추가 과목'}</span></span>
                    <span className="hidden text-ink-3 sm:inline">→</span>
                    <div className="flex items-center gap-2">
                      <Input list="my-subjects" aria-label={`${n} 과목 이름`} value={v} placeholder={isDeck ? n : '(가져오지 않음)'} onChange={(e) => setSubjectMap((m) => ({ ...m, [n]: e.target.value }))} className="max-w-xs" />
                      <span className="text-[12px] whitespace-nowrap text-ink-3">{!v.trim() ? (isDeck ? '원래 이름' : '빼기') : mine ? '내 과목에 합침' : '새 과목'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {subjectNames.extra.length ? (
              <label className="mt-3 flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={extraSubjects} onChange={(e) => setExtraSubjects(e.target.checked)} /> 보낸 사람이 문항에 붙인 추가 과목도 가져오기 ({subjectNames.extra.length}개)</label>
            ) : null}
          </Section>

          <Section title={`문항 (${chosen}/${total}개 선택)`}>
            <div className="space-y-3">
              {snap.decks.map((d, i) => {
                const keys = d.questions.map((q) => `${i}/${q.question.id}`);
                const on = keys.filter((k) => !excluded.has(k)).length;
                return (
                  <details key={i} open={total <= 60} className="rounded-md border border-line">
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px]">
                      <input type="checkbox" aria-label={`${d.title} 전체 선택`} checked={on === keys.length} ref={(el) => { if (el) el.indeterminate = on > 0 && on < keys.length; }} onChange={(e) => toggle(keys, e.target.checked)} onClick={(e) => e.stopPropagation()} />
                      <span className="font-medium">{d.title}</span><span className="text-ink-3">{on}/{keys.length} · {d.subject}</span>
                    </summary>
                    <ul className="max-h-96 overflow-y-auto border-t border-line">
                      {d.questions.map((q) => {
                        const k = `${i}/${q.question.id}`;
                        return (
                          <li key={k} className="flex items-start gap-2 border-b border-line px-3 py-2 last:border-0">
                            <input type="checkbox" className="mt-1" aria-label={`${q.question.id} 선택`} checked={!excluded.has(k)} onChange={(e) => toggle([k], e.target.checked)} />
                            <div className="min-w-0 flex-1">
                              <div className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3"><span>{q.question.id}</span><Badge>{TYPE_LABEL[q.question.type]}</Badge>{extraSubjects ? q.subjects.map((n) => <Badge key={n} tone="info">{n}</Badge>) : null}</div>
                              <Markdown inline className="line-clamp-2 text-sm [&_p]:inline">{q.question.prompt.replace(/\{\{\s*\w+\s*\}\}/g, '____')}</Markdown>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                );
              })}
            </div>
          </Section>

          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
            <Button variant="primary" disabled={!chosen || incomplete || accept.isPending} onClick={() => accept.mutate()} data-testid="share-accept"><Download className="h-4 w-4" /> 문항 {chosen}개 가져오기</Button>
            <Button variant="ghost" disabled={decline.isPending} onClick={() => { if (confirm('이 공유를 거절할까요?')) decline.mutate(); }}>거절</Button>
            <span className="text-[12px] text-ink-3">{incomplete ? '합칠 덱을 고르세요.' : '학습 기록 없이 새 카드로 시작합니다.'}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel className="p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </Panel>
  );
}
