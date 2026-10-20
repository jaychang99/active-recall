'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ClipboardPaste, FilePlus2, FileUp, Loader2, Play, Trash2, X, XCircle, Zap } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { validateBatch, type ValidationIssue } from '@recall/contracts';
import { api, type Deck, type ImportPlan, type SubjectSummary } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Select } from '@/components/ui/input';
import { Panel } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { ImportTargetPanel, applyTarget, type ImportTarget } from './import-target';
import { DEFAULT_BULK_TARGET, actionableRows, findConflicts, makeRow, resolveRows, totalCounts, type MultiRow, type ResolvedRow, type RowStatus, type RowTarget, type Strategy } from './multi-import-model';

const MAX_FILE = 5 * 1024 * 1024;

const STATUS: Record<RowStatus, { label: string; tone?: 'ok' | 'warn' | 'bad' | 'accent' }> = {
  parse_error: { label: 'JSON 오류', tone: 'bad' },
  idle: { label: '대기' },
  validating: { label: '검증 중…', tone: 'accent' },
  valid: { label: '검증 통과', tone: 'ok' },
  invalid: { label: '검증 실패', tone: 'bad' },
  committing: { label: '저장 중…', tone: 'accent' },
  done: { label: '완료', tone: 'ok' },
  error: { label: '저장 실패', tone: 'bad' },
};

const fmtCounts = (c: ImportPlan['counts']) => `생성 ${c.created} · 수정 ${c.updated} · 동일 ${c.unchanged}${c.resetSchedule ? ` · 스케줄 초기화 ${c.resetSchedule}` : ''}${c.deactivated ? ` · 비활성화 ${c.deactivated}` : ''}`;

/** 다중 가져오기: 여러 JSON 파일을 한 번에 올리고, 일괄 설정(덱·과목)에 파일별 오버라이드를 얹어 순서대로 검증·가져오기. */
export function MultiImport() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<MultiRow[]>([]);
  const [bulk, setBulk] = useState<ImportTarget>(DEFAULT_BULK_TARGET);
  const [strategy, setStrategy] = useState<Strategy>('upsert');
  const [allOrNothing, setAllOrNothing] = useState(true);
  const [running, setRunning] = useState<'validate' | 'commit' | 'both' | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api<Deck[]>('/decks') });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => api<SubjectSummary[]>('/subjects') });
  const deckList = useMemo(() => decks.data ?? [], [decks.data]);

  const resolved = useMemo(() => resolveRows(rows, bulk, deckList), [rows, bulk, deckList]);
  const conflicts = useMemo(() => findConflicts(resolved, strategy), [resolved, strategy]);
  const rowProblems = resolved.filter((r) => r.row.value !== null && r.problems.length);
  const pending = actionableRows(rows);
  const validCount = rows.filter((r) => r.status === 'valid').length;
  const doneCount = rows.filter((r) => r.status === 'done').length;
  const canRun = !running && pending.length > 0 && rowProblems.length === 0;

  const patch = (id: string, p: Partial<MultiRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  /** Any change to targets/strategy invalidates previous validation results (not completed imports). */
  const resetResults = () => setRows((rs) => rs.map((r) => (r.status === 'done' || r.status === 'parse_error' ? r : { ...r, status: 'idle', issues: [], plan: null, error: null })));

  const addFiles = async (files: Iterable<File>) => {
    const next: MultiRow[] = [];
    // Snapshot first: a FileList is live, and the input is cleared (and the drop's DataTransfer released) before the first await resumes.
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE) { toast.error(`${f.name}: 파일이 5 MB를 초과합니다`); continue; }
      next.push(makeRow(f.name, f.size, await f.text()));
    }
    if (next.length) setRows((rs) => [...rs, ...next]);
  };
  const addClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) { toast.error('클립보드가 비어 있습니다'); return; }
      setRows((rs) => [...rs, makeRow(`클립보드 #${rs.length + 1}`, new TextEncoder().encode(t).length, t)]);
    } catch { toast.error('클립보드를 읽을 수 없습니다'); }
  };

  const payloadOf = (r: ResolvedRow) => applyTarget(r.row.value, r.target, deckList);

  /** Validates the given rows one after another; returns the ids that passed. */
  const validateRows = async (targets: ResolvedRow[]) => {
    const passed: string[] = [];
    for (const r of targets) {
      patch(r.row.id, { status: 'validating', issues: [], plan: null, error: null, report: null });
      try {
        const value = payloadOf(r);
        const local = validateBatch(value);
        if (!local.ok) { patch(r.row.id, { status: 'invalid', issues: local.issues }); continue; }
        const plan = await api<ImportPlan>('/imports/validate', { method: 'POST', json: { batch: value, strategy } });
        patch(r.row.id, { status: plan.ok ? 'valid' : 'invalid', issues: plan.issues, plan });
        if (plan.ok) passed.push(r.row.id);
      } catch (e) {
        patch(r.row.id, { status: 'invalid', error: (e as Error).message, issues: ((e as { details?: { issues?: ValidationIssue[] } }).details?.issues) ?? [] });
      }
    }
    return passed;
  };
  /** Commits the given rows one after another (each file is its own transaction); returns how many succeeded. */
  const commitRows = async (targets: ResolvedRow[]) => {
    let ok = 0;
    for (const r of targets) {
      patch(r.row.id, { status: 'committing', error: null });
      try {
        const report = await api<ImportPlan>('/imports/commit', { method: 'POST', json: { batch: payloadOf(r), strategy } });
        patch(r.row.id, { status: 'done', report, plan: null });
        ok += 1;
      } catch (e) {
        patch(r.row.id, { status: 'error', error: (e as Error).message, issues: ((e as { details?: { issues?: ValidationIssue[] } }).details?.issues) ?? [] });
      }
    }
    if (ok) { void qc.invalidateQueries({ queryKey: ['decks'] }); void qc.invalidateQueries({ queryKey: ['subjects'] }); }
    return ok;
  };

  const run = async (mode: 'validate' | 'commit' | 'both') => {
    if (running) return;
    setRunning(mode);
    try {
      const snapshot = resolveRows(rows, bulk, deckList).filter((r) => r.row.value !== null && r.row.status !== 'done');
      if (mode === 'validate') {
        const passed = await validateRows(snapshot);
        toast[passed.length === snapshot.length ? 'success' : 'warning'](`검증 완료 — ${passed.length}/${snapshot.length}개 파일 통과`);
        return;
      }
      if (mode === 'commit') {
        const list = snapshot.filter((r) => r.row.status === 'valid');
        const ok = await commitRows(list);
        toast[ok === list.length ? 'success' : 'error'](`가져오기 완료 — ${ok}/${list.length}개 파일 저장`);
        return;
      }
      const passed = await validateRows(snapshot);
      if (passed.length < snapshot.length && allOrNothing) {
        toast.error(`원클릭 가져오기 중단 — ${snapshot.length - passed.length}개 파일이 검증에 실패해 아무것도 저장하지 않았습니다`);
        return;
      }
      if (!passed.length) { toast.error('검증을 통과한 파일이 없습니다'); return; }
      const list = snapshot.filter((r) => passed.includes(r.row.id));
      const ok = await commitRows(list);
      toast[ok === list.length ? 'success' : 'error'](`검증 통과 ${passed.length}/${snapshot.length} → ${ok}개 파일 저장 완료`);
    } finally { setRunning(null); }
  };

  const totals = totalCounts(rows);
  const busy = !!running;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) void addFiles(e.dataTransfer.files); }}
        className={cn('flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-dashed px-4 py-4 transition-colors', drag ? 'border-accent bg-accent-soft/30' : 'border-line-strong')}
        data-testid="multi-dropzone"
      >
        <div className="text-sm text-ink-2">
          <p className="font-medium text-ink">.json 파일 여러 개를 여기에 끌어다 놓거나 추가하세요.</p>
          <p className="mt-0.5 text-[12px] text-ink-3">파일마다 5 MB / 1,000문항 한도. 파일은 각각 별도 트랜잭션으로 저장됩니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => fileRef.current?.click()} disabled={busy} data-testid="multi-add-files"><FileUp className="h-4 w-4" /> 파일 추가</Button>
          <input ref={fileRef} type="file" multiple accept="application/json,.json" className="hidden" data-testid="multi-file-input" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
          <Button variant="ghost" onClick={() => void addClipboard()} disabled={busy}><ClipboardPaste className="h-4 w-4" /> 클립보드에서 추가</Button>
          {rows.length ? <Button variant="ghost" onClick={() => setRows([])} disabled={busy}><Trash2 className="h-4 w-4" /> 모두 비우기</Button> : null}
        </div>
      </div>

      <ImportTargetPanel
        value={bulk}
        onChange={(next) => { setBulk(next); resetResults(); }}
        json={null}
        heading="일괄 설정 — 모든 파일의 기본 덱·과목"
        hint="파일별로 아래 표에서 따로 지정하면 그 파일은 일괄 설정 대신 그 값을 씁니다."
        jsonDeckLabel="각 파일 JSON의 덱 그대로"
        jsonSubjectLabel="각 파일 JSON의 과목 그대로"
        disabled={busy}
        testId="multi-target"
      />

      <Panel className="overflow-hidden" data-testid="multi-rows">
        {rows.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-ink-3"><FilePlus2 className="h-4 w-4" /> 아직 파일이 없습니다. 위에서 파일을 추가하면 파일마다 덱·과목을 조정할 수 있습니다.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-muted/60 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">파일</th>
                <th className="px-3 py-2 font-medium">덱</th>
                <th className="px-3 py-2 font-medium">과목</th>
                <th className="px-3 py-2 font-medium">결과</th>
                <th className="w-9 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {resolved.map((r) => (
                <RowView key={r.row.id} r={r} decks={deckList} subjects={subjects.data ?? []} disabled={busy || r.row.status === 'done'} onTarget={(t) => { patch(r.row.id, { target: t, status: r.row.status === 'done' || r.row.status === 'parse_error' ? r.row.status : 'idle', issues: [], plan: null, error: null }); }} onRemove={() => setRows((rs) => rs.filter((x) => x.id !== r.row.id))} />
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {conflicts.length || rowProblems.length ? (
        <Panel className="border-warn/40 p-3 text-[13px]" role="status" data-testid="multi-warnings">
          {rowProblems.map((r) => <p key={r.row.id} className="flex items-start gap-1.5 text-bad-ink"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {r.row.name}: {r.problems.join(' ')}</p>)}
          {conflicts.map((c, i) => <p key={i} className="flex items-start gap-1.5 text-warn-ink"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {c.message}</p>)}
        </Panel>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={strategy} onChange={(e) => { setStrategy(e.target.value as Strategy); resetResults(); }} disabled={busy} aria-label="덮어쓰기 전략">
          <option value="upsert">업서트 — 새 문항 추가, 변경된 문항 갱신 (기본)</option>
          <option value="add_only">추가만 — 기존 문항은 건드리지 않음</option>
          <option value="replace_deck">덱 교체 — JSON에 없는 기존 문항은 비활성화</option>
        </Select>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <Checkbox checked={allOrNothing} onCheckedChange={(v) => setAllOrNothing(v === true)} disabled={busy} aria-label="하나라도 실패하면 전체 중단" />
          원클릭: 한 파일이라도 검증 실패 시 아무것도 저장 안 함
        </label>
        <span className="ml-auto text-[12px] text-ink-3 tabular">{rows.length}개 파일 · {rows.reduce((n, r) => n + r.questionCount, 0)}문항{doneCount ? ` · 완료 ${doneCount}` : ''}</span>
        <div className="flex basis-full flex-wrap gap-2">
          <Button onClick={() => void run('validate')} disabled={!canRun} data-testid="multi-validate-btn">{running === 'validate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} 전체 검증</Button>
          <Button variant="primary" onClick={() => void run('commit')} disabled={busy || validCount === 0 || rowProblems.length > 0} data-testid="multi-commit-btn">{running === 'commit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} 검증 통과한 {validCount}개 가져오기</Button>
          <Button variant="soft" onClick={() => void run('both')} disabled={!canRun} data-testid="multi-validate-and-commit-btn" title="모든 파일을 검증한 뒤 바로 가져옵니다">{running === 'both' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} 검증 + 가져오기 (원클릭)</Button>
        </div>
      </div>

      {doneCount ? (
        <Panel className="border-ok/40 p-4 text-sm" data-testid="multi-report">
          <div className="flex items-center gap-2 font-medium text-ok-ink"><CheckCircle2 className="h-4 w-4" /> {doneCount}개 파일 가져오기 완료</div>
          <p className="mt-1">{fmtCounts({ ...totals, skipped: 0 })}</p>
        </Panel>
      ) : null}
    </div>
  );
}

function RowView({ r, decks, subjects, disabled, onTarget, onRemove }: { r: ResolvedRow; decks: Deck[]; subjects: SubjectSummary[]; disabled: boolean; onTarget: (t: RowTarget) => void; onRemove: () => void }) {
  const { row, resolved, target } = r;
  const t = row.target;
  const set = <K extends keyof RowTarget>(k: K, v: RowTarget[K]) => onTarget({ ...t, [k]: v });
  const st = STATUS[row.status];
  const kb = (row.size / 1024).toFixed(1);
  const inheritDeck = t.deck === 'inherit' ? (target.deck === 'json' ? (row.json ? `${row.json.title || row.json.id}` : 'JSON의 덱') : target.deck === 'new' ? `새 덱 ${target.newDeckId || '(ID 미입력)'}` : (decks.find((d) => d.slug === target.deck)?.title ?? target.deck)) : '';
  const inheritSubject = t.subject === 'inherit' ? (target.subject === 'json' ? (row.json?.subject || 'JSON의 과목') : target.subject === 'new' ? `새 과목 ${target.newSubject || '(미입력)'}` : target.subject) : '';
  const showIssues = row.issues.length > 0;
  return (
    <>
      <tr className="border-t border-line align-top" data-testid="multi-row">
        <td className="px-3 py-2">
          <div className="font-medium text-ink break-all">{row.name}</div>
          <div className="mt-0.5 text-[12px] text-ink-3 tabular">{kb} KB{row.value !== null ? ` · ${row.questionCount}문항` : ''}</div>
          {row.json ? <div className="mt-0.5 text-[12px] text-ink-3">JSON: <span className="font-mono text-ink-2">{row.json.id || 'ID 없음'}</span> · {row.json.subject || '과목 없음'}</div> : null}
          {row.parseError ? <div className="mt-0.5 text-[12px] text-bad-ink">{row.parseError}</div> : null}
        </td>
        <td className="px-3 py-2">
          {row.value !== null ? (
            <div className="space-y-1.5">
              <Select className="w-full max-w-[260px]" value={t.deck} onChange={(e) => set('deck', e.target.value)} disabled={disabled} aria-label={`${row.name} 덱`} data-testid="multi-row-deck">
                <option value="inherit">일괄 설정 따름 → {inheritDeck}</option>
                <option value="json">JSON의 덱: {row.json?.title || '(제목 없음)'} ({row.json?.id || 'ID 없음'})</option>
                {decks.length ? <optgroup label="기존 덱에 추가">{decks.map((d) => <option key={d.id} value={d.slug}>{d.title} ({d.slug})</option>)}</optgroup> : null}
                <option value="new">새 덱 만들기…</option>
              </Select>
              {t.deck === 'new' ? (
                <div className="grid max-w-[260px] gap-1">
                  <Input aria-label={`${row.name} 새 덱 ID`} placeholder="새 덱 ID" value={t.newDeckId} onChange={(e) => set('newDeckId', e.target.value)} className="h-8 font-mono text-[12px]" spellCheck={false} disabled={disabled} />
                  <Input aria-label={`${row.name} 새 덱 제목`} placeholder={row.json?.title ? `제목 (비우면 "${row.json.title}")` : '덱 제목'} value={t.newDeckTitle} onChange={(e) => set('newDeckTitle', e.target.value)} className="h-8 text-[12px]" disabled={disabled} />
                </div>
              ) : null}
              {resolved ? <div className="text-[11px] text-ink-3">→ <span className="font-mono">{resolved.id || '?'}</span> {resolved.existing ? <Badge tone="warn">기존</Badge> : <Badge tone="ok">새 덱</Badge>}</div> : null}
            </div>
          ) : <span className="text-ink-3">—</span>}
        </td>
        <td className="px-3 py-2">
          {row.value !== null ? (
            <div className="space-y-1.5">
              <Select className="w-full max-w-[220px]" value={t.subject} onChange={(e) => set('subject', e.target.value)} disabled={disabled} aria-label={`${row.name} 과목`} data-testid="multi-row-subject">
                <option value="inherit">일괄 설정 따름 → {inheritSubject}</option>
                <option value="json">JSON의 과목: {row.json?.subject || '(없음)'}</option>
                {subjects.length ? <optgroup label="기존 과목">{subjects.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</optgroup> : null}
                <option value="new">새 과목 만들기…</option>
              </Select>
              {t.subject === 'new' ? <Input aria-label={`${row.name} 새 과목 이름`} placeholder="새 과목 이름" value={t.newSubject} onChange={(e) => set('newSubject', e.target.value)} className="h-8 max-w-[220px] text-[12px]" disabled={disabled} /> : null}
              {resolved ? <div className="text-[11px] text-ink-3">→ {resolved.subject || '—'}</div> : null}
            </div>
          ) : <span className="text-ink-3">—</span>}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5"><Badge tone={st.tone}>{st.label}</Badge>{row.plan?.ok && row.status === 'valid' ? <span className="text-[12px] text-ink-2 tabular">{fmtCounts(row.plan.counts)}</span> : null}</div>
          {row.report ? (
            <div className="mt-1 text-[12px] text-ink-2">
              <span className="tabular">{fmtCounts(row.report.counts)}</span>
              <span className="ml-2 inline-flex gap-2"><Link href={`/decks/${row.report.deckId}`} className="text-accent underline-offset-4 hover:underline">덱 열기</Link><Link href={`/study/${row.report.deckId}`} className="text-accent underline-offset-4 hover:underline">학습</Link></span>
            </div>
          ) : null}
          {row.error ? <p className="mt-1 text-[12px] text-bad-ink">{row.error}</p> : null}
          {showIssues ? (
            <details className="mt-1 text-[12px]">
              <summary className="cursor-pointer text-bad-ink">{row.issues.length}개 문제</summary>
              <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
                {row.issues.map((i, k) => (
                  <li key={k} className="rounded border border-line bg-muted/50 px-2 py-1">
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-ink-3"><Badge tone={i.kind === 'semantic' ? 'warn' : 'bad'}>{i.kind}</Badge>{i.questionIndex !== undefined ? <span>문항 #{i.questionIndex + 1}{i.questionId ? ` (${i.questionId})` : ''}</span> : null}<code>{i.path || '/'}</code></div>
                    <div className="mt-0.5">{i.message}</div>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </td>
        <td className="px-1 py-2"><Button variant="ghost" size="iconSm" aria-label={`${row.name} 제거`} onClick={onRemove} disabled={disabled && row.status !== 'done'}><X className="h-4 w-4" /></Button></td>
      </tr>
    </>
  );
}

