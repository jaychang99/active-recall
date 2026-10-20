import { describe, expect, it } from 'vitest';
import { DEFAULT_TARGET } from './import-target';
import { DEFAULT_ROW_TARGET, effectiveTarget, findConflicts, makeRow, resolveRows } from './multi-import-model';

const batch = (deck: { id: string; title: string; subject: string }, ids: string[]) => JSON.stringify({ schemaVersion: '1.0.0', deck, questions: ids.map((id) => ({ id, type: 'single_choice' })) });
const decks = [{ slug: 'os', title: '운영체제', subject: 'CS' }];

describe('multi import model', () => {
  it('parses files into rows and flags unparseable ones', () => {
    const ok = makeRow('a.json', 10, batch({ id: 'net', title: '네트워크', subject: 'CS' }, ['q1', 'q2']));
    expect(ok.status).toBe('idle');
    expect(ok.json).toEqual({ id: 'net', title: '네트워크', subject: 'CS' });
    expect(ok.questionIds).toEqual(['q1', 'q2']);
    const bad = makeRow('b.json', 3, '{nope');
    expect(bad.status).toBe('parse_error');
    expect(bad.value).toBeNull();
    expect(bad.parseError).toBeTruthy();
  });

  it('row fields override the bulk target only when not inherited', () => {
    const bulk = { ...DEFAULT_TARGET, deck: 'os', subject: 'new', newSubject: '시스템' };
    expect(effectiveTarget(bulk, DEFAULT_ROW_TARGET)).toEqual(bulk);
    const t = effectiveTarget(bulk, { ...DEFAULT_ROW_TARGET, deck: 'new', newDeckId: 'db', newDeckTitle: 'DB' });
    expect(t.deck).toBe('new'); expect(t.newDeckId).toBe('db'); expect(t.newDeckTitle).toBe('DB');
    expect(t.subject).toBe('new'); expect(t.newSubject).toBe('시스템'); // still inherited
    const j = effectiveTarget(bulk, { ...DEFAULT_ROW_TARGET, deck: 'json', subject: 'json' });
    expect(j.deck).toBe('json'); expect(j.subject).toBe('json');
  });

  it('resolves each row against decks and reports override problems per row', () => {
    const a = makeRow('a.json', 1, batch({ id: 'net', title: '네트워크', subject: 'CS' }, ['q1']));
    const b = { ...makeRow('b.json', 1, batch({ id: 'db', title: 'DB', subject: 'CS' }, ['q1'])), target: { ...DEFAULT_ROW_TARGET, deck: 'new', newDeckId: '' } };
    const r = resolveRows([a, b], { ...DEFAULT_TARGET, deck: 'os' }, decks);
    expect(r[0]?.resolved).toMatchObject({ id: 'os', title: '운영체제', existing: true, overridden: true });
    expect(r[0]?.problems).toEqual([]);
    expect(r[1]?.problems[0]).toMatch(/새 덱의 ID/);
  });

  it('finds replace_deck and duplicate-id conflicts between files landing in one deck', () => {
    const a = makeRow('a.json', 1, batch({ id: 'net', title: '네트워크', subject: 'CS' }, ['q1', 'q2']));
    const b = makeRow('b.json', 1, batch({ id: 'net', title: '네트워크 2', subject: 'CS' }, ['q2', 'q3']));
    const c = makeRow('c.json', 1, batch({ id: 'db', title: 'DB', subject: 'CS' }, ['q1']));
    const r = resolveRows([a, b, c], DEFAULT_TARGET, decks);
    expect(findConflicts(r, 'upsert')).toMatchObject([{ kind: 'duplicate_ids', deckId: 'net', rowIds: [a.id, b.id] }]);
    expect(findConflicts(r, 'upsert')[0]?.message).toContain('q2');
    expect(findConflicts(r, 'replace_deck').map((x) => x.kind)).toEqual(['replace_deck', 'duplicate_ids']);
    // All into one deck via the bulk target → the db file joins the group too.
    const all = resolveRows([a, b, c], { ...DEFAULT_TARGET, deck: 'os' }, decks);
    expect(findConflicts(all, 'replace_deck')[0]?.rowIds).toHaveLength(3);
  });
});
