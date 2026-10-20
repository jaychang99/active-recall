'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, EyeOff, Flag, GraduationCap, MoreHorizontal, NotebookPen, PauseCircle, Play, PlayCircle, RotateCcw, Tags, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useState } from 'react';
import { toast } from 'sonner';
import type { Question } from '@recall/contracts';
import { api, type DeckDetail, type Note, type QuestionPage, type QuestionRow } from '@/lib/api';
import { downloadFromApi } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/tooltip';
import { EmptyState, ErrorState, PageHeader, Panel, ProgressStrip, Skeleton } from '@/components/ui/misc';
import { Markdown } from '@/components/questions/markdown';
import { NoteHistoryItem } from '@/components/study/notes-panel';
import { DeckSubjectDialog } from '@/components/decks/deck-subject-dialog';
import { STATUS_LABEL, TYPE_LABEL, cn, formatDate, relativeDue } from '@/lib/utils';

const TYPES = Object.keys(TYPE_LABEL);

export default function DeckDetailPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = use(params);
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const deck = useQuery({ queryKey: ['deck', deckId], queryFn: () => api<DeckDetail>(`/decks/${deckId}`) });
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState('deck');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<QuestionRow | null>(null);
  const [tab, setTab] = useState<'questions' | 'notes'>('questions');

  const qs = new URLSearchParams({ page: String(page), pageSize: '50', sort, includeAnswers: String(showAnswers) });
  if (q) qs.set('q', q);
  if (type) qs.set('type', type);
  if (status) qs.set('status', status);
  if (tag) qs.set('tag', tag);
  if (onlyFlagged) qs.set('flagged', 'true');
  const questions = useQuery({ queryKey: ['deck-questions', deckId, qs.toString()], queryFn: () => api<QuestionPage>(`/decks/${deckId}/questions?${qs.toString()}`), enabled: tab === 'questions' });
  const notes = useQuery({ queryKey: ['deck-notes', deckId], queryFn: () => api<(Note & { question: { id: string; externalId: string; type: string; prompt: string } })[]>(`/decks/${deckId}/notes`), enabled: tab === 'notes' });

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['deck-questions', deckId] }); void qc.invalidateQueries({ queryKey: ['deck', deckId] }); void qc.invalidateQueries({ queryKey: ['decks'] }); };
  const bulk = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: string }) => api('/cards/bulk', { method: 'POST', json: { questionIds: ids, action } }),
    onSuccess: (_r, v) => { invalidate(); setSelected(new Set()); toast.success(`${v.ids.length}문항 처리: ${v.action}`); },
    onError: (e: Error) => toast.error(e.message),
  });
  const assignSubject = useMutation({
    mutationFn: ({ ids, name, remove }: { ids: string[]; name: string; remove?: boolean }) => api('/subjects/bulk-assign', { method: 'POST', json: { questionIds: ids, name, remove } }),
    onSuccess: () => { invalidate(); void qc.invalidateQueries({ queryKey: ['subjects'] }); setSelected(new Set()); toast.success('과목을 반영했습니다'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeDeck = useMutation({
    mutationFn: () => api(`/decks/${deckId}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['decks'] }); toast.success('덱을 삭제했습니다', { description: '복습 기록은 보존되며 복구할 수 있습니다.' }); router.push('/decks'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (deck.isLoading) return <div className="mx-auto max-w-6xl space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;
  if (deck.isError) return <ErrorState message={(deck.error as Error).message} onRetry={() => deck.refetch()} />;
  const d = deck.data!;
  const ids = [...selected];
  const toggleAll = () => setSelected(selected.size === (questions.data?.items.length ?? 0) ? new Set() : new Set(questions.data?.items.map((i) => i.id) ?? []));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={d.title}
        description={<>{d.subject} · {d.language} · {d.progress.total}문항 · 마지막 복습 {d.lastReviewedAt ? formatDate(d.lastReviewedAt) : '없음'}{d.description ? <> · {d.description}</> : null}</>}
        actions={
          <>
            <Link href={`/study/${d.id}`}><Button variant="primary"><Play className="h-4 w-4" /> 학습 {d.progress.dueToday ? `(due ${d.progress.dueToday})` : ''}</Button></Link>
            <Link href={`/study/${d.id}?mode=cram`}><Button><PlayCircle className="h-4 w-4" /> 훑기</Button></Link>
            <Link href={`/study/${d.id}?mode=practice`}><Button>연습</Button></Link>
            <Link href={`/study/${d.id}?mode=browse`} title="학습 상한·스케줄과 무관하게 모든 문제를 풀어보고 정답만 확인 (기록 없음)"><Button><Eye className="h-4 w-4" /> 구경</Button></Link>
            <Link href={`/exam?deckId=${d.id}`}><Button><GraduationCap className="h-4 w-4" /> 시험</Button></Link>
            <DeckSubjectDialog deckId={d.id} currentSubject={d.subject} questionCount={d.progress.total} onChanged={invalidate} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="덱 더 보기"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => void downloadFromApi(`/exports/decks/${d.id}/batch.json`, `${d.slug}.json`).catch((e: Error) => toast.error('내보내기 실패', { description: e.message }))}><Download className="h-4 w-4 text-ink-3" /> JSON 내보내기</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-bad-ink" onSelect={() => { if (confirm('이 덱을 삭제할까요? 복습 기록은 보존되며 복구할 수 있습니다.')) removeDeck.mutate(); }}><Trash2 className="h-4 w-4" /> 덱 삭제</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <Panel className="mb-6 grid gap-4 p-4 md:grid-cols-[1fr_auto]">
        <ProgressStrip p={d.progress} />
        <div className="flex flex-wrap gap-1.5 text-[12px]">
          <Badge tone={d.progress.dueToday ? 'accent' : 'neutral'}>due {d.progress.dueToday}</Badge><Badge tone={d.progress.flagged ? 'warn' : 'neutral'}>표시 {d.progress.flagged}</Badge><Badge tone={d.progress.suspended ? 'outline' : 'neutral'}>보류 {d.progress.suspended}</Badge><Badge tone={d.noteCount ? 'info' : 'neutral'}><NotebookPen className="h-3 w-3" /> 메모 {d.noteCount}</Badge>
        </div>
      </Panel>

      <div className="mb-3 flex gap-1 border-b border-line">
        {(['questions', 'notes'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn('-mb-px border-b-2 px-3 py-2 text-sm transition-colors', tab === t ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>{t === 'questions' ? '문항' : `메모 (${d.noteCount})`}</button>
        ))}
      </div>

      {tab === 'questions' ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="문항 검색 (프롬프트·ID·해설)" aria-label="문항 검색" className="max-w-xs" />
            <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="유형"><option value="">모든 유형</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select>
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="상태"><option value="">모든 상태</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Select value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }} aria-label="태그"><option value="">모든 태그</option>{d.questionTags.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>)}</Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="정렬"><option value="deck">덱 순서</option><option value="due">예정일</option><option value="lapses">실패 많은 순</option><option value="difficulty">FSRS 난이도</option><option value="reps">복습 횟수</option><option value="updated">최근 수정</option></Select>
            <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} /> 표시한 것만</label>
            <Button size="sm" variant={showAnswers ? 'soft' : 'secondary'} onClick={() => setShowAnswers((v) => !v)} className="ml-auto" data-testid="toggle-answers">{showAnswers ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} 정답 키 {showAnswers ? '숨기기' : '검토'}</Button>
          </div>
          {selected.size ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent-soft/40 px-3 py-2 text-[13px]">
              <span className="font-medium">{selected.size}개 선택</span>
              <Button size="sm" onClick={() => bulk.mutate({ ids, action: 'flag' })}><Flag className="h-3.5 w-3.5" /> 표시</Button>
              <Button size="sm" onClick={() => bulk.mutate({ ids, action: 'unflag' })}>표시 해제</Button>
              <Button size="sm" onClick={() => bulk.mutate({ ids, action: 'suspend' })}><PauseCircle className="h-3.5 w-3.5" /> 보류</Button>
              <Button size="sm" onClick={() => bulk.mutate({ ids, action: 'resume' })}>보류 해제</Button>
              <Button size="sm" onClick={() => { if (confirm('선택한 문항의 FSRS 스케줄을 초기화할까요? 기록은 유지됩니다.')) bulk.mutate({ ids, action: 'reset' }); }}><RotateCcw className="h-3.5 w-3.5" /> 스케줄 초기화</Button>
              <Button size="sm" onClick={() => { const n = prompt('추가할 과목 이름'); if (n) assignSubject.mutate({ ids, name: n }); }}><Tags className="h-3.5 w-3.5" /> 과목 추가</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>선택 해제</Button>
            </div>
          ) : null}
          {questions.isLoading ? <Skeleton className="h-64" /> : null}
          {questions.isError ? <ErrorState message={(questions.error as Error).message} onRetry={() => questions.refetch()} /> : null}
          {questions.data?.items.length === 0 ? <EmptyState title="조건에 맞는 문항이 없습니다" /> : null}
          {questions.data?.items.length ? (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm" data-testid="question-table">
                <thead className="text-left text-[12px] text-ink-3">
                  <tr className="border-b border-line">
                    <th className="w-8 px-2 py-2"><input type="checkbox" aria-label="전체 선택" checked={selected.size > 0 && selected.size === questions.data.items.length} onChange={toggleAll} /></th>
                    <th className="min-w-[14rem] px-2 py-2 font-normal">문항</th><th className="px-2 py-2 font-normal">유형</th><th className="px-2 py-2 font-normal">상태</th><th className="px-2 py-2 text-right font-normal whitespace-nowrap">예정</th><th className="px-2 py-2 text-right font-normal whitespace-nowrap">복습 / 실패</th><th className="px-2 py-2 font-normal">과목</th><th className="px-2 py-2 font-normal">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.data.items.map((row) => {
                    const qq = row.question as Question;
                    return (
                      <tr key={row.id} className={cn('border-b border-line last:border-0 hover:bg-muted/50', row.card?.suspended && 'opacity-60')}>
                        <td className="px-2 py-2"><input type="checkbox" aria-label={`${row.externalId} 선택`} checked={selected.has(row.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(row.id); else n.delete(row.id); return n; })} /></td>
                        <td className="max-w-md px-2 py-2">
                          <button type="button" className="block w-full text-left" onClick={() => setOpen(row)}>
                            <span className="mr-1.5 text-[11px] text-ink-3">{row.externalId}</span>
                            {row.card?.flagged ? <Flag className="mr-1 inline h-3 w-3 text-warn" fill="currentColor" /> : null}
                            <Markdown inline className="line-clamp-2 text-sm [&_p]:inline">{qq.prompt.replace(/\{\{\s*\w+\s*\}\}/g, '____')}</Markdown>
                          </button>
                          {showAnswers ? <div className="mt-1 text-[12px] text-accent-soft-ink"><AnswerSummary q={qq} /></div> : null}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap"><Badge>{TYPE_LABEL[row.type]}</Badge></td>
                        <td className="px-2 py-2 whitespace-nowrap text-[13px]">{row.card ? STATUS_LABEL[row.card.status] : '새 카드'}{row.card?.suspended ? ' · 보류' : ''}</td>
                        <td className="px-2 py-2 text-right tabular whitespace-nowrap text-[13px] text-ink-2">{row.card && row.card.status !== 'NEW' ? relativeDue(row.card.dueAt) : '—'}</td>
                        <td className="px-2 py-2 text-right tabular text-[13px] whitespace-nowrap">{row.reviewCount} <span className="text-ink-3">/ {row.card?.lapses ?? 0}</span></td>
                        <td className="px-2 py-2"><div className="flex flex-wrap items-center gap-1 text-[12px] text-ink-3">{row.subjects.map((s) => s.source === 'deck' ? <span key={s.id} className="whitespace-nowrap">{s.name}</span> : <Badge key={s.id} tone="info">{s.name}</Badge>)}</div></td>
                        <td className="px-2 py-2 whitespace-nowrap">{row.noteCount ? <Badge tone="info"><NotebookPen className="h-3 w-3" /> {row.noteCount}</Badge> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {questions.data && questions.data.total > 50 ? (
            <div className="mt-3 flex items-center justify-between text-[13px] text-ink-3">
              <span>{questions.data.total}문항 중 {(page - 1) * 50 + 1}–{Math.min(page * 50, questions.data.total)}</span>
              <div className="flex gap-2"><Button size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>이전</Button><Button size="sm" disabled={page * 50 >= questions.data.total} onClick={() => setPage((p) => p + 1)}>다음</Button></div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="space-y-2">
          {notes.isLoading ? <Skeleton className="h-40" /> : null}
          {notes.data?.length === 0 ? <EmptyState title="아직 메모가 없습니다" body="학습 화면에서 M 키로 회차별 메모를 남길 수 있습니다." /> : null}
          {notes.data?.map((n) => (
            <Panel key={n.id} className="p-3">
              <div className="mb-1 text-[12px] text-ink-3"><span className="mr-1.5">{n.question.externalId}</span><Badge>{TYPE_LABEL[n.question.type]}</Badge> <Markdown inline className="ml-1 line-clamp-1 [&_p]:inline">{n.question.prompt}</Markdown></div>
              <ul><NoteHistoryItem note={n} /></ul>
            </Panel>
          ))}
        </div>
      )}

      <QuestionDrawer row={open} onClose={() => setOpen(null)} deckId={deckId} onChanged={invalidate} />
    </div>
  );
}

function AnswerSummary({ q }: { q: Question }) {
  switch (q.type) {
    case 'single_choice': return <>정답: {q.choices.find((c) => c.id === q.answer.choiceId)?.text}</>;
    case 'multiple_choice': return <>정답: {q.answer.choiceIds.map((id) => q.choices.find((c) => c.id === id)?.text).join(', ')}</>;
    case 'true_false': return <>정답: {q.answer.value ? 'O (참)' : 'X (거짓)'}</>;
    case 'short_answer': return <>인정 답안: {q.answer.acceptedAnswers.join(' / ')}</>;
    case 'essay': return <>모범답안: {q.answer.modelAnswer.slice(0, 120)}… ({q.answer.maxScore}점)</>;
    case 'cloze': return <>{q.blanks.map((b) => `${b.id}=${b.acceptedAnswers[0]}`).join(', ')}</>;
    case 'ordering': return <>순서: {q.answer.orderedIds.map((id) => q.items.find((i) => i.id === id)?.text).join(' → ')}</>;
    case 'matching': return <>{q.answer.pairs.map((p) => `${q.left.find((l) => l.id === p.leftId)?.text} ↔ ${q.right.find((r) => r.id === p.rightId)?.text}`).join(' · ')}</>;
    case 'numeric': return <>정답: {q.answer.value}{q.answer.unit ? ` ${q.answer.unit}` : ''}{q.answer.tolerance ? ` ±${q.answer.tolerance}` : ''}{q.answer.relativeTolerance ? ` ±${q.answer.relativeTolerance * 100}%` : ''}</>;
    case 'cloze_select': return <>{q.blanks.map((b) => `${b.id}=${b.options.find((o) => o.id === b.answerOptionId)?.text}`).join(', ')}</>;
    case 'statement_set': return <>{q.statements.map((s) => `${s.value ? 'O' : 'X'} ${s.text.slice(0, 30)}`).join(' · ')}</>;
    case 'categorize': return <>{q.categories.map((c) => `${c.label}: ${q.items.filter((i) => i.categoryId === c.id).map((i) => i.text).join(', ')}`).join(' | ')}</>;
    case 'two_tier': return <>정답: {q.choices.find((c) => c.id === q.answer.choiceId)?.text} · 근거: {q.reasons.find((r) => r.id === q.answer.reasonId)?.text}</>;
    case 'recall_card': return <>뒷면: {q.back.slice(0, 120)}{q.answer?.acceptedAnswers?.length ? ` · 인정: ${q.answer.acceptedAnswers.join(' / ')}` : ''}</>;
    case 'stepwise': return <>{q.steps.map((s, i) => `${i + 1}) ${s.acceptedAnswers[0]}`).join(' → ')}</>;
    case 'highlight': return <>선택: {q.answer.segmentIds.map((id) => q.segments.find((s) => s.id === id)?.text).join(' / ')}</>;
    case 'cloze_bank': return <>{q.blanks.map((b) => `${b.id}=${q.bank.find((k) => k.id === b.bankItemId)?.text}`).join(', ')}</>;
    case 'code_cloze': return <>{q.blanks.map((b) => `${b.id}=${b.acceptedAnswers[0]}`).join(', ')}</>;
    case 'matrix': return <>{q.rows.map((r) => `${r.text}: ${q.answer.cells.filter((c) => c.rowId === r.id).map((c) => q.columns.find((x) => x.id === c.columnId)?.text).join(', ') || '—'}`).join(' | ')}</>;
    case 'numeric_grid': return <>{q.cells.map((c) => `${q.rows.find((r) => r.id === c.rowId)?.label}×${q.columns.find((x) => x.id === c.columnId)?.label}=${c.value}${c.tolerance ? `±${c.tolerance}` : ''}`).join(', ')}{q.unit ? ` (${q.unit})` : ''}</>;
    case 'list_answer': return <>{q.answer.required && q.answer.required < q.answer.items.length ? `${q.answer.items.length}개 중 ${q.answer.required}개: ` : ''}{q.answer.items.map((i) => i.acceptedAnswers[0]).join(' / ')}</>;
    case 'image_hotspot': return <>정답 영역: {q.answer.regionIds.map((id) => q.regions.find((r) => r.id === id)?.label ?? id).join(', ')}</>;
    case 'parsons': return <>{q.answer.lines.map((l) => `${'·'.repeat(l.indent)}${q.lines.find((x) => x.id === l.id)?.code}`).join(' ⏎ ')}{q.distractors?.length ? ` (방해 줄 ${q.distractors.length}개)` : ''}</>;
    case 'find_and_fix': return <>{q.answer.fixes.map((f) => `${q.segments.find((s) => s.id === f.segmentId)?.text} → ${f.acceptedAnswers[0]}`).join(' · ')}</>;
    case 'coordinate_point': return <>{q.answer.points.map((p) => `${p.label ? `${p.label} ` : ''}(${p.x}, ${p.y})${p.tolerance ? `±${p.tolerance}` : ''}`).join(', ')}</>;
    case 'regex_answer': return <>{q.answer.modelPattern ? `/${q.answer.modelPattern}/${q.answer.flags ?? ''}` : '모범 패턴 없음'} · 일치 {q.answer.shouldMatch.length}개 / 불일치 {q.answer.shouldNotMatch.length}개{q.answer.fullMatch ? ' · 전체 일치' : ''}</>;
  }
}

function QuestionDrawer({ row, onClose, deckId, onChanged }: { row: QuestionRow | null; onClose: () => void; deckId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const full = useQuery({ queryKey: ['question', row?.id], queryFn: () => api<{ question: Question; card: QuestionRow['card'] }>(`/questions/${row!.id}?includeAnswer=true`), enabled: !!row });
  const notes = useQuery({ queryKey: ['notes', row?.id], queryFn: () => api<{ currentRound: number; notes: Note[] }>(`/questions/${row!.id}/notes`), enabled: !!row });
  const reviews = useQuery({ queryKey: ['reviews', row?.id], queryFn: () => api<{ id: string; rating: number; reviewedAt: string; isCorrect: boolean | null; reviewRound: number; undone: boolean; elapsedMs: number }[]>(`/reviews?questionId=${row!.id}`), enabled: !!row });
  const subjects = useMutation({
    mutationFn: (names: string[]) => api(`/questions/${row!.id}/subjects`, { method: 'PUT', json: { names } }),
    onSuccess: () => { onChanged(); void qc.invalidateQueries({ queryKey: ['subjects'] }); toast.success('과목을 저장했습니다'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const action = useMutation({
    mutationFn: (a: string) => api(`/cards/${row!.id}/${a}`, { method: 'POST' }),
    onSuccess: () => { onChanged(); toast.success('적용했습니다'); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!row) return null;
  const q = full.data?.question;
  const manual = row.subjects.filter((s) => s.source === 'manual').map((s) => s.name);
  return (
    <Dialog open={!!row} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent title={`${row.externalId} · ${TYPE_LABEL[row.type]}`} description={`${deckId} · 수정 ${formatDate(row.updatedAt)} · 리비전 ${row.revision}`} wide>
        {q ? (
          <div className="space-y-4">
            <Markdown>{q.prompt}</Markdown>
            <div className="rounded-md border border-line bg-muted/50 p-3 text-sm"><div className="mb-1 text-[12px] font-semibold text-ink-3">정답 키</div><AnswerSummary q={q} /></div>
            <div className="rounded-md border border-line p-3 text-sm"><div className="mb-1 text-[12px] font-semibold text-ink-3">해설</div><Markdown className="prose-sm">{q.explanation.summary}</Markdown></div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-ink-3">과목</span>
              {row.subjects.map((s) => <Badge key={s.id} tone={s.source === 'deck' ? 'neutral' : 'info'}>{s.name}{s.source === 'manual' ? <button type="button" aria-label="제거" className="ml-1" onClick={() => subjects.mutate(manual.filter((n) => n !== s.name))}>×</button> : null}</Badge>)}
              <Button size="sm" variant="ghost" onClick={() => { const n = prompt('추가할 과목 (쉼표로 여러 개)'); if (n) subjects.mutate([...manual, ...n.split(',').map((x) => x.trim()).filter(Boolean)]); }}><Tags className="h-3.5 w-3.5" /> 과목 추가</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => action.mutate(row.card?.flagged ? 'unflag' : 'flag')}><Flag className="h-3.5 w-3.5" /> {row.card?.flagged ? '표시 해제' : '표시'}</Button>
              <Button size="sm" onClick={() => action.mutate(row.card?.suspended ? 'resume' : 'suspend')}><PauseCircle className="h-3.5 w-3.5" /> {row.card?.suspended ? '보류 해제' : '보류'}</Button>
              <Button size="sm" onClick={() => { if (confirm('스케줄을 초기화할까요?')) action.mutate('reset'); }}><RotateCcw className="h-3.5 w-3.5" /> 스케줄 초기화</Button>
            </div>
            <section>
              <h4 className="mb-1 text-[12px] font-semibold text-ink-3">복습 기록 ({reviews.data?.filter((r) => !r.undone).length ?? 0}회)</h4>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-[13px]">
                {reviews.data?.map((r) => <li key={r.id} className={cn('flex gap-3 tabular', r.undone && 'line-through opacity-50')}><span>{r.reviewRound}회차</span><span>{['', '다시', '어려움', '보통', '쉬움'][r.rating]}</span><span>{r.isCorrect === null ? '—' : r.isCorrect ? '정답' : '오답'}</span><span className="text-ink-3">{formatDate(r.reviewedAt, { dateStyle: 'short', timeStyle: 'short' })}</span><span className="text-ink-3">{Math.round(r.elapsedMs / 1000)}초</span></li>)}
                {reviews.data?.length === 0 ? <li className="text-ink-3">아직 복습하지 않았습니다</li> : null}
              </ul>
            </section>
            <section>
              <h4 className="mb-1 text-[12px] font-semibold text-ink-3">회차별 메모 (현재 {notes.data?.currentRound ?? 1}회차)</h4>
              <ul className="space-y-2">{notes.data?.notes.map((n) => <NoteHistoryItem key={n.id} note={n} />)}{notes.data?.notes.length === 0 ? <li className="text-[13px] text-ink-3">메모 없음</li> : null}</ul>
            </section>
          </div>
        ) : <Skeleton className="h-40" />}
      </DialogContent>
    </Dialog>
  );
}
