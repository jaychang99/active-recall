'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Bot, Check, ChevronDown, ChevronRight, ExternalLink, Globe, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading';
import { RATINGS } from './rating-bar';

interface LlmLink { reviewRound: number; url: string; createdAt: string; updatedAt: string; review: { rating: number; reviewedAt: string } | null }
interface LlmLinks { questionId: string; currentRound: number; links: LlmLink[] }
/** GET /link-preview — fetched live by the API, never stored. */
interface LinkPreview { url: string; finalUrl: string; status: 'ok' | 'partial' | 'failed'; title: string | null; description: string | null; siteName: string | null; image: string | null; icon: string | null; error?: string }

/** Names for the common share hosts, shown when a page will not give out a preview (bot walls, sign-in). */
const PROVIDERS: [RegExp, string][] = [
  [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, 'ChatGPT'],
  [/(^|\.)claude\.ai$/, 'Claude'],
  [/(^|\.)(gemini\.google\.com|g\.co|aistudio\.google\.com)$/, 'Gemini'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
  [/(^|\.)(grok\.com|x\.com)$/, 'Grok'],
  [/(^|\.)deepseek\.com$/, 'DeepSeek'],
  [/(^|\.)copilot\.microsoft\.com$/, 'Copilot'],
];
function hostOf(url: string) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
function providerOf(url: string) { const h = hostOf(url); return PROVIDERS.find(([re]) => re.test(h))?.[1] ?? null; }
export function isLinkUrl(raw: string) {
  try { const u = new URL(raw.trim()); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

function Favicon({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <Globe className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element -- third-party favicon, no optimisation needed
  return <img src={src} alt="" referrerPolicy="no-referrer" className="h-4 w-4 shrink-0 rounded-sm" onError={() => setBroken(true)} />;
}

function OgImage({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  // eslint-disable-next-line @next/next/no-img-element -- third-party OG image, no optimisation needed
  return <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-14 w-24 shrink-0 rounded border border-line object-cover max-sm:hidden" onError={() => setBroken(true)} />;
}

/** The link as a card: icon, title, site and a line saying whether the preview could be read. */
export function LinkPreviewCard({ url, label }: { url: string; label?: React.ReactNode }) {
  const q = useQuery({
    queryKey: ['link-preview', url],
    queryFn: () => api<LinkPreview>(`/link-preview?url=${encodeURIComponent(url)}`),
    staleTime: 6 * 60 * 60_000,
    retry: false,
  });
  const p = q.data;
  const provider = providerOf(url);
  const title = p?.title ?? provider ?? hostOf(url);
  const icon = p?.icon ?? (q.isError || p?.status === 'failed' ? `https://${hostOf(url)}/favicon.ico` : null);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="group flex min-w-0 items-start gap-3 rounded-md border border-line bg-bg p-2.5 hover:border-line-strong hover:bg-muted" data-testid="link-preview" data-status={q.isPending ? 'loading' : q.isError ? 'failed' : p?.status}>
      <div className="min-w-0 flex-1 space-y-0.5">
        {label ? <div className="text-[12px] text-ink-3">{label}</div> : null}
        <div className="flex min-w-0 items-center gap-2">
          {q.isPending ? <Spinner className="h-4 w-4 shrink-0" /> : <Favicon src={icon} />}
          <span className="truncate text-sm font-medium text-ink">{q.isPending ? (provider ?? hostOf(url)) : title}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-3 group-hover:text-ink-2" aria-hidden />
        </div>
        {p?.description ? <p className="line-clamp-2 text-[12px] text-ink-2">{p.description}</p> : null}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
          <span className="truncate">{p?.siteName && p.siteName !== title ? `${p.siteName} · ` : ''}{hostOf(p?.finalUrl ?? url)}</span>
          {q.isPending ? <span>미리보기 불러오는 중…</span>
            : p?.status === 'ok' ? <span className="inline-flex items-center gap-0.5 text-ok-ink"><Check className="h-3 w-3" aria-hidden />미리보기 확인됨</span>
            : p?.status === 'partial' ? <span>미리보기에 제목이 없습니다</span>
            : <span className="inline-flex items-center gap-0.5"><AlertCircle className="h-3 w-3" aria-hidden />미리보기를 가져오지 못했습니다{p?.error ? ` (${p.error.replace('http_', 'HTTP ')})` : ''} · 링크는 그대로 열립니다</span>}
        </div>
      </div>
      {p?.image ? <OgImage src={p.image} /> : null}
    </a>
  );
}

function roundLabel(l: LlmLink, hideRound: boolean, i: number) {
  const rating = l.review ? RATINGS[l.review.rating - 1] : undefined;
  return (
    <>
      <span className="font-medium text-ink-2">{hideRound ? `이전 복습 ${i + 1}` : `${l.reviewRound}회차`}</span>
      <span className="tabular"> · {formatDateTime(l.review?.reviewedAt ?? l.updatedAt)}</span>
      {rating ? <span className={cn('font-medium', rating.cls.split(' ')[1])}> · {rating.ko}</span> : null}
    </>
  );
}

/**
 * One external LLM answer link per review round (e.g. the share link of the chat that explained or graded this
 * question), plus the latest and every earlier round's link. Shown after submit/reveal only, so an earlier
 * answer never leaks while answering.
 */
export function LlmLinksPanel({ questionId, round, hideRound }: { questionId: string; round: number; hideRound: boolean }) {
  const qc = useQueryClient();
  const key = ['llm-links', questionId];
  const q = useQuery({ queryKey: key, queryFn: () => api<LlmLinks>(`/questions/${questionId}/llm-links`) });
  const current = q.data?.links.find((l) => l.reviewRound === round) ?? null;
  const previous = (q.data?.links ?? []).filter((l) => l.reviewRound < round);
  const [draft, setDraft] = useState('');
  const [showLatest, setShowLatest] = useState(false);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setDraft(current?.url ?? ''); }, [current?.url]);

  const save = useMutation({
    mutationFn: (url: string) => api<LlmLink>(`/questions/${questionId}/llm-links/${round}`, { method: 'PUT', json: { url } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); toast.success('LLM 답변 링크를 저장했습니다'); },
    onError: (e: Error) => toast.error('링크를 저장하지 못했습니다', { description: e.message }),
  });
  const remove = useMutation({
    mutationFn: () => api(`/questions/${questionId}/llm-links/${round}`, { method: 'DELETE' }),
    onSuccess: () => { setDraft(''); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error('링크를 지우지 못했습니다', { description: e.message }),
  });
  const trimmed = draft.trim();
  const invalid = trimmed.length > 0 && !isLinkUrl(trimmed);
  const commit = (value = trimmed) => {
    if (!value || !isLinkUrl(value) || value === current?.url || save.isPending) return;
    save.mutate(value);
  };

  return (
    <section className="space-y-3 rounded-lg border border-line bg-elevated p-3 sm:p-4" aria-label="외부 LLM 답변" data-testid="llm-links">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-ink-3" aria-hidden />
        <h3 className="text-[13px] font-semibold text-ink-2">외부 LLM 답변 링크{hideRound ? '' : ` · ${round}회차`}</h3>
        {save.isPending ? <span className="flex items-center gap-1 text-[12px] text-ink-3"><Spinner className="h-3 w-3" />저장 중…</span> : current ? <span className="text-[12px] text-ok-ink">저장됨</span> : null}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); commit(); }}>
        <Input
          type="url"
          inputMode="url"
          enterKeyHint="done"
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => { const pasted = e.clipboardData.getData('text').trim(); if (isLinkUrl(pasted)) { e.preventDefault(); setDraft(pasted); commit(pasted); } }}
          onBlur={() => commit()}
          placeholder="ChatGPT·Claude·Gemini 등 대화 공유 링크를 붙여넣으세요"
          aria-label="외부 LLM 답변 링크"
          aria-invalid={invalid || undefined}
          className="min-w-0 flex-1"
          data-testid="llm-link-input"
        />
        {current ? (
          <Button variant="ghost" size="icon" aria-label="이번 회차 링크 지우기" loading={remove.isPending} onClick={() => remove.mutate()} className="max-md:h-11 max-md:w-11"><Trash2 className="h-4 w-4" /></Button>
        ) : (
          <Button type="submit" variant="ghost" disabled={!trimmed || invalid} loading={save.isPending} className="max-md:h-11">저장</Button>
        )}
      </form>
      {invalid ? <p className="text-[12px] text-bad-ink">http(s)로 시작하는 링크를 입력하세요.</p> : null}
      {current ? <LinkPreviewCard url={current.url} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" disabled={!previous.length} aria-expanded={showLatest} onClick={() => setShowLatest((v) => !v)} data-testid="llm-latest-toggle" className="max-md:h-10">
          {previous.length ? '마지막 LLM 답변 확인' : '이전 LLM 답변 없음'}
          {previous.length ? (showLatest ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : null}
        </Button>
        <Button size="sm" variant="ghost" disabled={!previous.length} aria-expanded={showAll} onClick={() => setShowAll((v) => !v)} data-testid="llm-history-toggle" className="max-md:h-10">
          이전 LLM 답변 목록{previous.length ? <span className="tabular text-ink-3">{previous.length}</span> : null}
          {previous.length ? (showAll ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : null}
        </Button>
      </div>
      {showLatest && previous[0] ? <LinkPreviewCard url={previous[0].url} label={roundLabel(previous[0], hideRound, 0)} /> : null}
      {showAll && previous.length ? (
        <ol className="space-y-2" data-testid="llm-history">
          {previous.map((l, i) => <li key={l.reviewRound}><LinkPreviewCard url={l.url} label={roundLabel(l, hideRound, i)} /></li>)}
        </ol>
      ) : null}
    </section>
  );
}
