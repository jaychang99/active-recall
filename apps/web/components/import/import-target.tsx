'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api, type Deck, type SubjectSummary } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select } from '@/components/ui/input';
import { Panel } from '@/components/ui/misc';

/** Deck/subject the batch will be imported into. 'json' = as written in the batch; 'new' = typed below; otherwise an existing deck slug / subject name. */
export interface ImportTarget {
  deck: 'json' | 'new' | string;
  newDeckId: string;
  newDeckTitle: string;
  subject: 'json' | 'new' | string;
  newSubject: string;
}

export const DEFAULT_TARGET: ImportTarget = { deck: 'json', newDeckId: '', newDeckTitle: '', subject: 'json', newSubject: '' };

export interface JsonDeck { id: string; title: string; subject: string }

/** The deck block of a parsed batch, or null when the text is not (yet) a batch with a deck. */
export function readJsonDeck(value: unknown): JsonDeck | null {
  const d = (value as { deck?: Record<string, unknown> } | null)?.deck;
  if (!d || typeof d !== 'object') return null;
  return { id: typeof d.id === 'string' ? d.id : '', title: typeof d.title === 'string' ? d.title : '', subject: typeof d.subject === 'string' ? d.subject : '' };
}

export const DECK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

/** What the batch's deck block becomes after the target is applied. */
export function resolveTarget(t: ImportTarget, json: JsonDeck | null, decks: Pick<Deck, 'slug' | 'title' | 'subject'>[]): { id: string; title: string; subject: string; existing: boolean; overridden: boolean } | null {
  if (!json) return null;
  let id = json.id;
  let title = json.title;
  let existing = decks.some((d) => d.slug === json.id);
  if (t.deck === 'new') { id = t.newDeckId.trim(); title = t.newDeckTitle.trim() || json.title; existing = decks.some((d) => d.slug === id); }
  else if (t.deck !== 'json') { const d = decks.find((x) => x.slug === t.deck); if (d) { id = d.slug; title = d.title; existing = true; } }
  const subject = t.subject === 'json' ? json.subject : t.subject === 'new' ? t.newSubject.trim() : t.subject;
  return { id, title, subject, existing, overridden: id !== json.id || title !== json.title || subject !== json.subject };
}

/** Returns the batch with its deck block rewritten to the chosen target (the rest of the document is untouched). */
export function applyTarget<T>(value: T, t: ImportTarget, decks: Pick<Deck, 'slug' | 'title' | 'subject'>[]): T {
  const json = readJsonDeck(value);
  const r = resolveTarget(t, json, decks);
  if (!r || !r.overridden) return value;
  const v = value as { deck: Record<string, unknown> };
  return { ...v, deck: { ...v.deck, id: r.id, title: r.title, subject: r.subject } } as T;
}

/** Problems that would make the override itself invalid (the schema check would catch them too, with a worse message). */
export function targetProblems(t: ImportTarget): string[] {
  const out: string[] = [];
  if (t.deck === 'new') {
    if (!t.newDeckId.trim()) out.push('새 덱의 ID를 입력하세요.');
    else if (!DECK_ID_RE.test(t.newDeckId.trim())) out.push('덱 ID는 영문·숫자로 시작하고 영문·숫자·밑줄·하이픈만 쓸 수 있습니다 (80자 이내).');
  }
  if (t.subject === 'new' && !t.newSubject.trim()) out.push('새 과목의 이름을 입력하세요.');
  return out;
}

export function ImportTargetPanel({ value: t, onChange, json, heading = '가져올 위치', hint = 'JSON을 붙여넣으면 JSON의 덱·과목이 기본값으로 표시됩니다.', jsonDeckLabel = 'JSON의 덱 그대로', jsonSubjectLabel = 'JSON의 과목 그대로', disabled, testId = 'import-target' }: { value: ImportTarget; onChange: (next: ImportTarget) => void; json: JsonDeck | null; heading?: string; /** Shown instead of the resolved summary when `json` is null. */ hint?: string; jsonDeckLabel?: string; jsonSubjectLabel?: string; disabled?: boolean; testId?: string }) {
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api<Deck[]>('/decks') });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => api<SubjectSummary[]>('/subjects') });
  const list = decks.data ?? [];
  const resolved = resolveTarget(t, json, list);
  const jsonExists = !!json && list.some((d) => d.slug === json.id);
  const set = <K extends keyof ImportTarget>(k: K, v: ImportTarget[K]) => onChange({ ...t, [k]: v });
  const problems = targetProblems(t);

  return (
    <Panel className="p-4" data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-ink-2">{heading}</h2>
        {resolved ? (
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-ink-3" data-testid="import-target-summary">
            <ArrowRight className="h-3.5 w-3.5" /> 덱 <span className="font-mono text-ink">{resolved.id}</span> · 과목 <span className="text-ink">{resolved.subject || '—'}</span>
            {resolved.overridden ? <Badge tone="accent">JSON과 다름</Badge> : <Badge>JSON 그대로</Badge>}
            {resolved.existing ? <Badge tone="warn">기존 덱 갱신</Badge> : <Badge tone="ok">새 덱</Badge>}
          </span>
        ) : <span className="text-[12px] text-ink-3">{hint}</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${testId}-deck`}>덱</Label>
          <Select id={`${testId}-deck`} className="w-full" value={t.deck} onChange={(e) => set('deck', e.target.value)} disabled={disabled} data-testid={`${testId}-deck`}>
            <option value="json">{json ? `JSON의 덱: ${json.title || '(제목 없음)'} (${json.id || 'ID 없음'})${jsonExists ? ' · 기존 덱' : ' · 새 덱'}` : jsonDeckLabel}</option>
            {list.length ? <optgroup label="기존 덱에 추가">{list.map((d) => <option key={d.id} value={d.slug}>{d.title} ({d.slug}) · {d.subject}</option>)}</optgroup> : null}
            <option value="new">새 덱 만들기…</option>
          </Select>
          {t.deck === 'new' ? (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Input aria-label="새 덱 ID" placeholder="예: os_midterm_02" value={t.newDeckId} onChange={(e) => set('newDeckId', e.target.value)} className="font-mono text-[13px]" spellCheck={false} disabled={disabled} data-testid={`${testId}-new-deck-id`} />
              <Input aria-label="새 덱 제목" placeholder={json?.title ? `제목 (비우면 "${json.title}")` : '덱 제목'} value={t.newDeckTitle} onChange={(e) => set('newDeckTitle', e.target.value)} disabled={disabled} />
            </div>
          ) : t.deck !== 'json' ? <p className="text-[12px] text-ink-3">기존 덱의 제목은 유지되고, 문항은 선택한 덮어쓰기 전략에 따라 추가·갱신됩니다.</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${testId}-subject`}>과목</Label>
          <Select id={`${testId}-subject`} className="w-full" value={t.subject} onChange={(e) => set('subject', e.target.value)} disabled={disabled} data-testid={`${testId}-subject`}>
            <option value="json">{json?.subject ? `JSON의 과목: ${json.subject}` : jsonSubjectLabel}</option>
            {subjects.data?.length ? <optgroup label="기존 과목">{subjects.data.map((s) => <option key={s.id} value={s.name}>{s.name} · {s.questionCount}문항</option>)}</optgroup> : null}
            <option value="new">새 과목 만들기…</option>
          </Select>
          {t.subject === 'new' ? <Input aria-label="새 과목 이름" placeholder="예: 운영체제" value={t.newSubject} onChange={(e) => set('newSubject', e.target.value)} disabled={disabled} data-testid={`${testId}-new-subject`} /> : <p className="text-[12px] text-ink-3">가져온 문항 전체에 덱 과목으로 부여됩니다. 문항별 추가 과목은 덱 상세에서 지정합니다.</p>}
        </div>
      </div>
      {problems.length ? <ul className="mt-2 space-y-0.5 text-[12px] text-warn-ink" role="status">{problems.map((p) => <li key={p}>· {p}</li>)}</ul> : null}
    </Panel>
  );
}
