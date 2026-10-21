'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardPaste, FileUp, Play, XCircle, Zap } from 'lucide-react';
import Link from '@/components/ui/navigation-link';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { parseBatchJson, validateBatch, type ValidationIssue } from '@recall/contracts';
import { api, type Deck, type ImportPlan } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label, Select } from '@/components/ui/input';
import { Panel } from '@/components/ui/misc';
import { TYPE_LABEL, cn, copyToClipboard } from '@/lib/utils';
import { DEFAULT_TARGET, ImportTargetPanel, applyTarget, readJsonDeck, targetProblems, type ImportTarget } from './import-target';
import { schemaText } from '@/lib/prompt-bundle';
import exampleBatch from '../../../../examples/example-question-batch.json';

type Strategy = 'upsert' | 'add_only' | 'replace_deck';

/** 개별 가져오기: JSON 하나를 붙여넣거나 파일 하나를 열어 검증 → 확정. */
export function SingleImport() {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [strategy, setStrategy] = useState<Strategy>('upsert');
  const [clientIssues, setClientIssues] = useState<ValidationIssue[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [report, setReport] = useState<ImportPlan | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Where the batch goes: defaults to the deck/subject written in the JSON, overridable (existing or new).
  const [target, setTarget] = useState<ImportTarget>(DEFAULT_TARGET);
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api<Deck[]>('/decks') });
  const jsonDeck = useMemo(() => { if (!text.trim()) return null; const p = parseBatchJson(text); return p.ok ? readJsonDeck(p.value) : null; }, [text]);
  const targetIssues = targetProblems(target);

  /** The batch as it will be sent: parsed, then its deck block rewritten to the chosen target. */
  const parsed = () => {
    const p = parseBatchJson(text);
    if (!p.ok) { setParseError(p.error ?? 'invalid JSON'); setClientIssues(null); return null; }
    setParseError(null);
    if (targetIssues.length) { toast.error('가져올 위치를 확인하세요', { description: targetIssues.join(' ') }); return null; }
    return applyTarget(p.value, target, decks.data ?? []);
  };

  const validate = useMutation({
    mutationFn: async () => {
      const value = parsed();
      if (value === null) throw new Error('JSON을 파싱할 수 없습니다');
      const local = validateBatch(value); // step 1: instant client validation
      setClientIssues(local.issues);
      if (!local.ok) return null;
      return api<ImportPlan>('/imports/validate', { method: 'POST', json: { batch: value, strategy } }); // step 2: server schema+semantic+diff
    },
    onSuccess: (p) => { setPlan(p); setReport(null); },
    onError: (e: Error) => toast.error('검증 실패', { description: e.message }),
  });
  const commit = useMutation({
    mutationFn: async () => {
      const value = parsed();
      if (value === null) throw new Error('JSON을 파싱할 수 없습니다');
      return api<ImportPlan>('/imports/commit', { method: 'POST', json: { batch: value, strategy } });
    },
    onSuccess: (r) => {
      setReport(r);
      setPlan(null);
      void qc.invalidateQueries({ queryKey: ['decks'] });
      void qc.invalidateQueries({ queryKey: ['subjects'] });
      toast.success(`덱 "${r.deckSlug ?? r.deckId}" 가져오기 완료`, { description: `생성 ${r.counts.created} · 수정 ${r.counts.updated} · 동일 ${r.counts.unchanged} · 스케줄 초기화 ${r.counts.resetSchedule}` });
    },
    onError: (e: Error & { details?: { issues?: ValidationIssue[] } }) => {
      toast.error('가져오기 실패 — 아무것도 저장되지 않았습니다', { description: e.message });
      if (e.details?.issues) setClientIssues(e.details.issues);
    },
  });

  /** 검증 → (문제 없으면) 즉시 가져오기 확정. */
  const validateAndCommit = useMutation({
    mutationFn: async () => {
      const value = parsed();
      if (value === null) throw new Error('JSON을 파싱할 수 없습니다');
      const local = validateBatch(value);
      setClientIssues(local.issues);
      if (!local.ok) throw new Error(`클라이언트 검증 실패 (${local.issues.length}개 문제) — 아래 목록을 확인하세요`);
      const p = await api<ImportPlan>('/imports/validate', { method: 'POST', json: { batch: value, strategy } });
      setPlan(p);
      if (!p.ok) throw new Error(`서버 검증 실패 (${p.issues.length}개 문제) — 아래 목록을 확인하세요`);
      return api<ImportPlan>('/imports/commit', { method: 'POST', json: { batch: value, strategy } });
    },
    onSuccess: (r) => {
      setReport(r);
      setPlan(null);
      void qc.invalidateQueries({ queryKey: ['decks'] });
      void qc.invalidateQueries({ queryKey: ['subjects'] });
      toast.success(`검증 통과 → 덱 "${r.deckSlug ?? r.deckId}" 가져오기 완료`, { description: `생성 ${r.counts.created} · 수정 ${r.counts.updated} · 동일 ${r.counts.unchanged} · 스케줄 초기화 ${r.counts.resetSchedule}` });
    },
    onError: (e: Error & { details?: { issues?: ValidationIssue[] } }) => {
      toast.error('원클릭 가져오기 중단 — 아무것도 저장되지 않았습니다', { description: e.message });
      if (e.details?.issues) setClientIssues(e.details.issues);
    },
  });

  const loadFile = async (f: File) => {
    if (f.size > 5 * 1024 * 1024) { toast.error('파일이 5 MB를 초과합니다'); return; }
    setText(await f.text());
    setPlan(null); setReport(null); setClientIssues(null); setParseError(null);
  };
  const issues = clientIssues ?? plan?.issues ?? [];
  const byType = plan?.summary?.byType ?? null;

  const busy = validate.isPending || commit.isPending || validateAndCommit.isPending;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-wrap items-center gap-2 lg:col-span-2" data-testid="import-actions">
        <Button loading={validateAndCommit.isPending} loadingLabel="검증 + 저장 중…" variant="primary" size="lg" className="max-sm:w-full" onClick={() => validateAndCommit.mutate()} disabled={!text.trim() || busy || !!report || targetIssues.length > 0} data-testid="validate-and-commit-btn" title="검증을 통과하면 바로 가져옵니다 (⌘/Ctrl+Enter)"><Zap className="h-4 w-4" /> 검증 + 가져오기 (원클릭)</Button>
        <Button loading={validate.isPending} onClick={() => validate.mutate()} disabled={!text.trim() || busy || targetIssues.length > 0} data-testid="validate-btn"><CheckCircle2 className="h-4 w-4" /> {validate.isPending ? '검증 중…' : '검증'}</Button>
        <Button loading={commit.isPending} onClick={() => commit.mutate()} disabled={!plan?.ok || busy || !!report} data-testid="commit-btn"><Play className="h-4 w-4" /> {commit.isPending ? '저장 중…' : '가져오기 확정'}</Button>
        <span className="ml-auto text-[12px] text-ink-3 tabular">{(new TextEncoder().encode(text).length / 1024).toFixed(1)} KB · 한도 5 MB / 1,000문항</span>
      </div>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => navigator.clipboard.readText().then((t) => { setText(t); setPlan(null); setReport(null); }).catch(() => toast.error('클립보드를 읽을 수 없습니다'))}><ClipboardPaste className="h-4 w-4" /> 클립보드에서 붙여넣기</Button>
          <Button disabled={busy} onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> 파일 열기</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f && !busy) void loadFile(f); e.target.value = ''; }} />
          <Button disabled={busy} variant="ghost" onClick={() => { setText(JSON.stringify(exampleBatch, null, 2)); setPlan(null); setReport(null); setClientIssues(null); }} data-testid="load-example">8종 예제 불러오기</Button>
          <Button variant="ghost" onClick={() => void copyToClipboard(JSON.stringify(exampleBatch, null, 2)).then(() => toast.success('예제 JSON 복사됨'))}>예제 복사</Button>
          <Button variant="ghost" onClick={() => void copyToClipboard(schemaText()).then(() => toast.success('스키마 복사됨'))}>스키마 복사</Button>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f && !busy) void loadFile(f); }}
          className={cn('rounded-lg border-2 border-dashed transition-colors focus-within:border-accent', drag ? 'border-accent bg-accent-soft/30' : 'border-line-strong')}
        >
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setPlan(null); setReport(null); setClientIssues(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim() && !report && !busy) { e.preventDefault(); validateAndCommit.mutate(); } }}
            spellCheck={false}
            aria-label="JSON 입력"
            readOnly={busy} data-testid="import-textarea"
            placeholder={'{\n  "schemaVersion": "1.0.0",\n  "deck": { ... },\n  "questions": [ ... ]\n}\n\n여기에 붙여넣거나 .json 파일을 끌어다 놓으세요.'}
            className="h-[min(420px,45svh)] min-h-56 w-full resize-y rounded-lg bg-elevated p-3 sm:p-4 font-mono text-[13px] leading-relaxed outline-none"
          />
        </div>
      </div>

      <div className="min-w-0 space-y-4" data-testid="import-settings">
        <ImportTargetPanel disabled={busy} value={target} onChange={(next) => { setTarget(next); setPlan(null); setReport(null); }} json={jsonDeck} />
        <Panel className="space-y-2 p-4">
          <Label htmlFor="single-import-strategy">덮어쓰기 전략</Label>
          <Select id="single-import-strategy" className="w-full" disabled={busy} value={strategy} onChange={(e) => { setStrategy(e.target.value as Strategy); setPlan(null); }}>
            <option value="upsert">업서트 — 새 문항 추가, 변경된 문항 갱신 (기본)</option>
            <option value="add_only">추가만 — 기존 문항은 건드리지 않음</option>
            <option value="replace_deck">덱 교체 — JSON에 없는 기존 문항은 비활성화</option>
          </Select>
          {strategy === 'replace_deck' ? <p className="text-[12px] text-warn-ink">덱 교체: JSON에 없는 기존 문항은 비활성화됩니다 (복습 기록은 보존).</p> : null}
        </Panel>
        {parseError ? <Panel className="border-bad/40 p-4 text-sm"><div className="flex items-center gap-2 font-medium text-bad-ink"><XCircle className="h-4 w-4" /> JSON 파싱 오류</div><p className="mt-1 text-ink-2">{parseError}</p></Panel> : null}
        {issues.length ? (
          <Panel className="border-bad/40 p-4" data-testid="issues">
            <div className="flex items-center gap-2 text-sm font-medium text-bad-ink"><XCircle className="h-4 w-4" /> 검증 실패 — {issues.length}개 문제</div>
            <ul className="mt-2 max-h-80 space-y-1.5 overflow-y-auto text-[13px]">
              {issues.map((i, k) => (
                <li key={k} className="rounded border border-line bg-muted/50 px-2 py-1.5">
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-ink-3"><Badge tone={i.kind === 'semantic' ? 'warn' : 'bad'}>{i.kind}</Badge>{i.questionIndex !== undefined ? <span>문항 #{i.questionIndex + 1}{i.questionId ? ` (${i.questionId})` : ''}</span> : null}<code>{i.path || '/'}</code></div>
                  <div className="mt-0.5">{i.message}</div>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
        {plan?.ok ? (
          <Panel className="p-4" data-testid="plan">
            <div className="flex items-center gap-2 text-sm font-medium text-ok-ink"><CheckCircle2 className="h-4 w-4" /> 검증 통과 — 스키마 + 의미 검사</div>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-ink-3">덱</dt><dd>{plan.deck?.newTitle} <span className="text-[11px] text-ink-3">({plan.deck?.slug}){plan.deck?.exists ? ' · 기존 덱 갱신' : ' · 새 덱'}</span></dd>
              <dt className="text-ink-3">문항 수</dt><dd className="tabular">{plan.summary?.total}</dd>
              <dt className="text-ink-3">생성 / 수정 / 동일</dt><dd className="tabular">{plan.counts.created} / {plan.counts.updated} / {plan.counts.unchanged}</dd>
              <dt className="text-ink-3">스케줄 초기화</dt><dd className="tabular">{plan.counts.resetSchedule} <span className="text-[11px] text-ink-3">정답이 바뀐 문항</span></dd>
              {plan.counts.deactivated ? <><dt className="text-ink-3">비활성화</dt><dd className="tabular">{plan.counts.deactivated}</dd></> : null}
              {plan.counts.skipped ? <><dt className="text-ink-3">건너뜀</dt><dd className="tabular">{plan.counts.skipped}</dd></> : null}
            </dl>
            {byType ? <div className="mt-3 flex flex-wrap gap-1">{Object.entries(byType).filter(([, n]) => n > 0).map(([t, n]) => <Badge key={t}>{TYPE_LABEL[t]} {n}</Badge>)}</div> : null}
            {plan.items.some((i) => i.op !== 'create') ? (
              <details className="mt-3 text-[13px]"><summary className="cursor-pointer text-ink-2">문항별 변경 내역</summary>
                <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">{plan.items.filter((i) => i.op !== 'create').map((i) => <li key={i.externalId} className="flex gap-2"><code className="text-ink-3">{i.externalId}</code><span>{i.op}</span>{i.resetSchedule ? <Badge tone="warn">스케줄 초기화</Badge> : null}<span className="text-ink-3">{i.reason}</span></li>)}</ul>
              </details>
            ) : null}
            {plan.counts.resetSchedule ? <p className="mt-2 text-[12px] text-warn-ink">정답 의미가 바뀐 {plan.counts.resetSchedule}개 문항은 학습 스케줄이 새 카드로 초기화됩니다 (복습 기록은 보존).</p> : null}
          </Panel>
        ) : null}
        {report ? (
          <Panel className="border-ok/40 p-4" data-testid="report">
            <div className="flex items-center gap-2 text-sm font-medium text-ok-ink"><CheckCircle2 className="h-4 w-4" /> 가져오기 완료</div>
            <p className="mt-1 text-sm">생성 {report.counts.created} · 수정 {report.counts.updated} · 동일 {report.counts.unchanged} · 스케줄 초기화 {report.counts.resetSchedule}{report.counts.deactivated ? ` · 비활성화 ${report.counts.deactivated}` : ''}</p>
            <div className="mt-3 flex gap-2"><Link href={`/decks/${report.deckId}`}><Button variant="primary">덱 열기</Button></Link><Link href={`/study/${report.deckId}`}><Button>바로 학습</Button></Link></div>
          </Panel>
        ) : null}
        {!plan && !report && !issues.length && !parseError ? (
          <Panel className="p-4 text-sm text-ink-2">
            <details>
              <summary className="cursor-pointer font-medium text-ink">가져오기 도움말</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>상단 <strong>LLM 프롬프트</strong> 버튼으로 프롬프트+스키마를 복사해 LLM에 붙여넣고 자료(PDF·교안·주제)를 첨부합니다.</li>
                <li>LLM이 출력한 JSON 전체를 입력창에 붙여넣습니다. <strong>가져올 위치</strong>에 JSON의 덱·과목이 기본값으로 뜨며, 기존 덱·과목을 고르거나 새로 만들어 바꿀 수 있습니다.</li>
                <li>상단 <strong>검증 + 가져오기 (원클릭)</strong> 또는 입력창에서 ⌘/Ctrl+Enter를 누르면 검증을 통과할 때만 바로 저장됩니다. 같은 JSON을 다시 가져와도 중복되지 않습니다.</li>
                <li>변경 내용을 먼저 보려면 <strong>검증</strong>으로 미리보기를 확인한 뒤 <strong>가져오기 확정</strong>을 누르세요.</li>
              </ol>
            </details>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
