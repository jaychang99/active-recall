import { parseBatchJson, type ValidationIssue } from '@recall/contracts';
import type { Deck, ImportPlan } from '@/lib/api';
import { DEFAULT_TARGET, readJsonDeck, resolveTarget, targetProblems, type ImportTarget, type JsonDeck } from './import-target';

export type Strategy = 'upsert' | 'add_only' | 'replace_deck';

/** Per-file override. 'inherit' = follow the bulk setting; the other values mean the same as in ImportTarget. */
export interface RowTarget {
  deck: 'inherit' | 'json' | 'new' | string;
  newDeckId: string;
  newDeckTitle: string;
  subject: 'inherit' | 'json' | 'new' | string;
  newSubject: string;
}

export const DEFAULT_ROW_TARGET: RowTarget = { deck: 'inherit', newDeckId: '', newDeckTitle: '', subject: 'inherit', newSubject: '' };

export type RowStatus = 'parse_error' | 'idle' | 'validating' | 'valid' | 'invalid' | 'committing' | 'done' | 'error';

export interface MultiRow {
  id: string;
  name: string;
  size: number;
  /** Parsed batch (null when the file is not valid JSON). */
  value: unknown | null;
  parseError: string | null;
  json: JsonDeck | null;
  questionCount: number;
  /** ids of the questions (for cross-file duplicate detection). */
  questionIds: string[];
  target: RowTarget;
  status: RowStatus;
  issues: ValidationIssue[];
  plan: ImportPlan | null;
  report: ImportPlan | null;
  error: string | null;
}

let seq = 0;
export function makeRow(name: string, size: number, text: string): MultiRow {
  const p = parseBatchJson(text);
  const value = p.ok ? p.value : null;
  const json = p.ok ? readJsonDeck(p.value) : null;
  const qs = (value as { questions?: unknown } | null)?.questions;
  const list = Array.isArray(qs) ? qs : [];
  const questionIds = list.map((q) => (q && typeof q === 'object' && typeof (q as { id?: unknown }).id === 'string' ? (q as { id: string }).id : '')).filter(Boolean);
  seq += 1;
  return {
    id: `f${Date.now().toString(36)}-${seq}`,
    name,
    size,
    value,
    parseError: p.ok ? null : (p.error ?? 'invalid JSON'),
    json,
    questionCount: list.length,
    questionIds,
    target: DEFAULT_ROW_TARGET,
    status: p.ok ? 'idle' : 'parse_error',
    issues: [],
    plan: null,
    report: null,
    error: null,
  };
}

/** The target a row is actually imported with: the bulk setting, with the row's own fields overriding when not 'inherit'. */
export function effectiveTarget(bulk: ImportTarget, row: RowTarget): ImportTarget {
  return {
    deck: row.deck === 'inherit' ? bulk.deck : row.deck,
    newDeckId: row.deck === 'new' ? row.newDeckId : bulk.newDeckId,
    newDeckTitle: row.deck === 'new' ? row.newDeckTitle : bulk.newDeckTitle,
    subject: row.subject === 'inherit' ? bulk.subject : row.subject,
    newSubject: row.subject === 'new' ? row.newSubject : bulk.newSubject,
  };
}

export interface ResolvedRow {
  row: MultiRow;
  target: ImportTarget;
  /** What the deck block becomes (null for unparseable files). */
  resolved: ReturnType<typeof resolveTarget>;
  /** Problems with this row's own override (not with the bulk target). */
  problems: string[];
}

export function resolveRows(rows: MultiRow[], bulk: ImportTarget, decks: Pick<Deck, 'slug' | 'title' | 'subject'>[]): ResolvedRow[] {
  return rows.map((row) => {
    const target = effectiveTarget(bulk, row.target);
    return { row, target, resolved: resolveTarget(target, row.json, decks), problems: targetProblems(target) };
  });
}

export interface Conflict { kind: 'replace_deck' | 'duplicate_ids'; deckId: string; rowIds: string[]; message: string }

/**
 * Things that are not errors per file but go wrong when several files land in the same deck:
 * - replace_deck: each later file would deactivate the earlier files' questions.
 * - the same question id in two files for one deck: the later file silently overwrites the earlier one.
 */
export function findConflicts(resolved: ResolvedRow[], strategy: Strategy): Conflict[] {
  const byDeck = new Map<string, ResolvedRow[]>();
  for (const r of resolved) { if (!r.resolved?.id) continue; const l = byDeck.get(r.resolved.id) ?? []; l.push(r); byDeck.set(r.resolved.id, l); }
  const out: Conflict[] = [];
  for (const [deckId, group] of byDeck) {
    if (group.length < 2) continue;
    if (strategy === 'replace_deck') out.push({ kind: 'replace_deck', deckId, rowIds: group.map((g) => g.row.id), message: `덱 ${deckId}에 ${group.length}개 파일이 들어갑니다. 덱 교체 전략에서는 나중 파일이 앞 파일의 문항을 비활성화합니다 — 업서트를 쓰거나 파일을 합치세요.` });
    const seen = new Map<string, string>();
    const dups = new Set<string>();
    const rowIds = new Set<string>();
    for (const g of group) for (const qid of g.row.questionIds) { const prev = seen.get(qid); if (prev && prev !== g.row.id) { dups.add(qid); rowIds.add(prev); rowIds.add(g.row.id); } else seen.set(qid, g.row.id); }
    if (dups.size) out.push({ kind: 'duplicate_ids', deckId, rowIds: [...rowIds], message: `덱 ${deckId}: 문항 ID ${[...dups].slice(0, 5).join(', ')}${dups.size > 5 ? ` 외 ${dups.size - 5}개` : ''}가 여러 파일에 있습니다. 나중 파일의 문항이 앞 파일의 것을 덮어씁니다.` });
  }
  return out;
}

/** Bulk target as applied with no per-row overrides. Re-exported so the UI has a single default to start from. */
export const DEFAULT_BULK_TARGET: ImportTarget = DEFAULT_TARGET;

/** Rows the "validate all" / "import all" actions act on: parsed files that have not been imported yet. */
export function actionableRows(rows: MultiRow[]): MultiRow[] {
  return rows.filter((r) => r.value !== null && r.status !== 'done');
}

export function totalCounts(rows: MultiRow[]) {
  const t = { created: 0, updated: 0, unchanged: 0, resetSchedule: 0, deactivated: 0 };
  for (const r of rows) { const c = r.report?.counts; if (!c) continue; t.created += c.created; t.updated += c.updated; t.unchanged += c.unchanged; t.resetSchedule += c.resetSchedule; t.deactivated += c.deactivated; }
  return t;
}
