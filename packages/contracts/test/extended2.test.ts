import { describe, expect, it } from 'vitest';
import extended2 from '../../../examples/example-extended2-batch.json';
import extended from '../../../examples/example-extended-batch.json';
import example from '../../../examples/example-question-batch.json';
import { EXTENDED2_QUESTION_TYPES, checkRegexSafety, compileSafeRegex, gradeAnswer, isObjectivelyGradable, pointInShape, toPublicQuestion, validateBatch, type Question } from '../src/index';

const byId = (id: string) => (extended2.questions as Question[]).find((q) => q.id === id) as Question;

describe('extended question types, set 2 (additive)', () => {
  it('earlier examples still validate unchanged', () => {
    expect(validateBatch(example).ok).toBe(true);
    expect(validateBatch(extended).ok).toBe(true);
  });
  it('the set-2 example validates and covers all 10 new types once', () => {
    const r = validateBatch(extended2);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    for (const t of EXTENDED2_QUESTION_TYPES) expect(r.summary?.byType[t]).toBe(1);
    for (const q of extended2.questions as Question[]) expect(isObjectivelyGradable(q)).toBe(true);
  });

  it('cloze_bank grades per blank by bank item id', () => {
    const q = byId('ext2-q001');
    expect(gradeAnswer(q, { type: 'cloze_bank', blanks: { b1: 'k200', b2: 'k404', b3: 'k500' } }).isCorrect).toBe(true);
    const r = gradeAnswer(q, { type: 'cloze_bank', blanks: { b1: 'k200', b2: 'k403', b3: 'k500' } });
    expect(r.isCorrect).toBe(false);
    expect(r.detail.partialRatio).toBeCloseTo(2 / 3);
  });

  it('code_cloze is case-sensitive by default and tolerant of surrounding whitespace', () => {
    const q = byId('ext2-q002');
    expect(gradeAnswer(q, { type: 'code_cloze', blanks: { op: ' ** ', fn: 'range', rem: '0' } }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { type: 'code_cloze', blanks: { op: '**', fn: 'Range', rem: '0' } }).isCorrect).toBe(false);
    expect(gradeAnswer(q, { type: 'code_cloze', blanks: { op: '*', fn: 'range', rem: '0' } }).detail.partialRatio).toBeCloseTo(2 / 3);
  });

  it('matrix grades each row as a set of columns', () => {
    const q = byId('ext2-q003');
    const full = [
      { rowId: 'merge', columnId: 'stable' }, { rowId: 'merge', columnId: 'nlogn' },
      { rowId: 'quick', columnId: 'inplace' }, { rowId: 'quick', columnId: 'nlogn' },
      { rowId: 'insertion', columnId: 'stable' }, { rowId: 'insertion', columnId: 'inplace' },
      { rowId: 'heap', columnId: 'inplace' }, { rowId: 'heap', columnId: 'nlogn' },
    ];
    expect(gradeAnswer(q, { type: 'matrix', cells: [...full].reverse() }).isCorrect).toBe(true);
    const r = gradeAnswer(q, { type: 'matrix', cells: [...full, { rowId: 'heap', columnId: 'stable' }] });
    expect(r.isCorrect).toBe(false);
    expect(r.detail.parts?.find((p) => p.id === 'heap')?.correct).toBe(false);
    expect(r.detail.partialRatio).toBe(0.75);
  });

  it('numeric_grid applies per-cell tolerance', () => {
    const q = byId('ext2-q004');
    expect(gradeAnswer(q, { type: 'numeric_grid', values: { a11: 2, a12: 1, a21: 4, a22: 3 } }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { type: 'numeric_grid', values: { a11: 2, a12: 1, a21: 4, a22: null } }).detail.partialRatio).toBe(0.75);
    const tol = { ...(q as Extract<Question, { type: 'numeric_grid' }>) };
    tol.cells = tol.cells.map((c) => ({ ...c, tolerance: 0.1 }));
    expect(gradeAnswer(tol, { type: 'numeric_grid', values: { a11: 2.05, a12: 0.95, a21: 4.1, a22: 3 } }).isCorrect).toBe(true);
  });

  it('list_answer is order-independent, rejects duplicates and wrong entries, and honours required', () => {
    const q = byId('ext2-q005');
    expect(gradeAnswer(q, { type: 'list_answer', entries: ['durability', '일관성', 'ISOLATION', 'Atomicity'] }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { type: 'list_answer', entries: ['Atomicity', 'Atomicity', 'Consistency', 'Isolation'] }).isCorrect).toBe(false);
    const three = { ...(q as Extract<Question, { type: 'list_answer' }>), answer: { ...(q as Extract<Question, { type: 'list_answer' }>).answer, required: 3 } };
    expect(gradeAnswer(three, { type: 'list_answer', entries: ['Atomicity', 'Consistency', 'Isolation'] }).isCorrect).toBe(true);
    const wrongExtra = gradeAnswer(three, { type: 'list_answer', entries: ['Atomicity', 'Consistency', 'Isolation', 'Speed'] });
    expect(wrongExtra.isCorrect).toBe(false);
    expect(wrongExtra.detail.partialRatio).toBe(1);
  });

  it('image_hotspot: one marker per target region, no stray markers', () => {
    const q = byId('ext2-q006');
    expect(gradeAnswer(q, { type: 'image_hotspot', points: [{ x: 0.5, y: 0.5 }] }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { type: 'image_hotspot', points: [{ x: 0.5, y: 0.65 }] }).isCorrect).toBe(false);
    expect(gradeAnswer(q, { type: 'image_hotspot', points: [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.1 }] }).isCorrect).toBe(false);
    expect(pointInShape({ x: 0.5, y: 0.5 }, { kind: 'circle', cx: 0.5, cy: 0.5, r: 0.1 })).toBe(true);
    expect(pointInShape({ x: 0.5, y: 0.65 }, { kind: 'circle', cx: 0.5, cy: 0.5, r: 0.1 })).toBe(false);
    expect(pointInShape({ x: 0.5, y: 0.5 }, { kind: 'polygon', points: [[0, 0], [1, 0], [0.5, 1]] })).toBe(true);
    expect(pointInShape({ x: 0.05, y: 0.9 }, { kind: 'polygon', points: [[0, 0], [1, 0], [0.5, 1]] })).toBe(false);
  });

  it('parsons checks order, indentation and rejects distractors', () => {
    const q = byId('ext2-q007');
    const ok = [{ id: 'def', indent: 0 }, { id: 'init', indent: 1 }, { id: 'loop', indent: 1 }, { id: 'mul', indent: 2 }, { id: 'ret', indent: 1 }];
    expect(gradeAnswer(q, { type: 'parsons', lines: ok }).isCorrect).toBe(true);
    const badIndent = gradeAnswer(q, { type: 'parsons', lines: ok.map((l) => (l.id === 'mul' ? { ...l, indent: 1 } : l)) });
    expect(badIndent.isCorrect).toBe(false);
    expect(badIndent.detail.partialRatio).toBe(0.8);
    expect(gradeAnswer(q, { type: 'parsons', lines: [...ok, { id: 'd-reti', indent: 1 }] }).isCorrect).toBe(false);
    const noIndent = { ...(q as Extract<Question, { type: 'parsons' }>), checkIndent: false };
    expect(gradeAnswer(noIndent, { type: 'parsons', lines: ok.map((l) => ({ ...l, indent: 0 })) }).isCorrect).toBe(true);
  });

  it('find_and_fix needs the right segments located and fixed, nothing else selected', () => {
    const q = byId('ext2-q008');
    expect(gradeAnswer(q, { type: 'find_and_fix', fixes: [{ segmentId: 's5', text: 'order by name asc;' }, { segmentId: 's2', text: 'FROM' }] }).isCorrect).toBe(true);
    const located = gradeAnswer(q, { type: 'find_and_fix', fixes: [{ segmentId: 's2', text: 'FROM' }, { segmentId: 's5', text: 'ORDER name;' }] });
    expect(located.isCorrect).toBe(false);
    expect(located.detail.note).toContain('2/2 located');
    expect(gradeAnswer(q, { type: 'find_and_fix', fixes: [{ segmentId: 's2', text: 'FROM' }, { segmentId: 's5', text: 'ORDER BY name ASC;' }, { segmentId: 's4', text: 'WHERE age > 18' }] }).isCorrect).toBe(false);
  });

  it('coordinate_point matches each expected point to the closest unused placed point', () => {
    const q = byId('ext2-q009');
    expect(gradeAnswer(q, { type: 'coordinate_point', points: [{ x: 0, y: -1 }, { x: 2, y: 3 }] }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { type: 'coordinate_point', points: [{ x: 2, y: 3 }] }).detail.partialRatio).toBe(0.5);
    expect(gradeAnswer(q, { type: 'coordinate_point', points: [{ x: 2, y: 3 }, { x: 0, y: -1 }, { x: 1, y: 1 }] }).isCorrect).toBe(false);
    const tol = { ...(q as Extract<Question, { type: 'coordinate_point' }>) };
    tol.answer = { points: tol.answer.points.map((p) => ({ ...p, tolerance: 0.5 })) };
    expect(gradeAnswer(tol, { type: 'coordinate_point', points: [{ x: 2.3, y: 3.2 }, { x: 0, y: -1.4 }] }).isCorrect).toBe(true);
  });

  it('regex_answer tests every example and refuses unsafe patterns', () => {
    const q = byId('ext2-q010');
    expect(gradeAnswer(q, { type: 'regex_answer', pattern: '\\d{4}-\\d{2}-\\d{2}' }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { type: 'regex_answer', pattern: '[0-9]{4}-[0-9]{2}-[0-9]{2}' }).isCorrect).toBe(true);
    const loose = gradeAnswer(q, { type: 'regex_answer', pattern: '\\d+-\\d+-\\d+' });
    expect(loose.isCorrect).toBe(false);
    expect(loose.detail.parts?.find((p) => p.id === 'reject-3')?.correct).toBe(false);
    const invalid = gradeAnswer(q, { type: 'regex_answer', pattern: '(' });
    expect(invalid.isCorrect).toBe(false);
    expect(invalid.detail.note).toContain('pattern rejected');
    expect(checkRegexSafety('(a+)+$').ok).toBe(false);
    expect(checkRegexSafety('(?:\\d+\\s)*x').ok).toBe(false);
    expect(checkRegexSafety('(a|b)+c').ok).toBe(true);
    expect(checkRegexSafety('^[a-z]+@[a-z]+\\.com$').ok).toBe(true);
    expect(checkRegexSafety('(a)\\1').ok).toBe(false);
    expect(checkRegexSafety('a'.repeat(201)).ok).toBe(false);
    expect(compileSafeRegex('abc', 'g').re).toBeNull();
  });

  it('public projections hide every answer key of the new types', () => {
    for (const q of extended2.questions as Question[]) {
      const json = JSON.stringify(toPublicQuestion(q));
      for (const leak of ['bankItemId', 'acceptedAnswers', '"cells":[{"rowId"', '"value":', 'regions', 'distractors', '"indent"', 'modelPattern', '"x":2', 'segmentId']) expect(json, `${q.type} leaks ${leak}`).not.toContain(leak);
    }
    const parsons = toPublicQuestion(byId('ext2-q007')) as { blocks: { id: string }[]; lines?: unknown };
    expect(parsons.blocks.map((b) => b.id).sort()).toEqual(['d-reti', 'd-zero', 'def', 'init', 'loop', 'mul', 'ret']);
    expect(parsons.lines).toBeUndefined();
    expect((toPublicQuestion(byId('ext2-q006')) as { answer: { count: number } }).answer.count).toBe(1);
    expect((toPublicQuestion(byId('ext2-q010')) as { answer: { shouldMatch: string[] } }).answer.shouldMatch.length).toBe(2);
  });

  it('semantic rules catch bad references in the new types', () => {
    const bad = JSON.parse(JSON.stringify(extended2)) as { questions: Record<string, unknown>[] };
    (bad.questions[0] as { blanks: { bankItemId: string }[] }).blanks[0]!.bankItemId = 'k404'; // reused + unknown ordering
    (bad.questions[1] as { code: string }).code = 'x {{op}} 2';
    (bad.questions[2] as { answer: { cells: { rowId: string; columnId: string }[] } }).answer.cells.push({ rowId: 'bubble', columnId: 'stable' });
    (bad.questions[3] as { cells: { rowId: string }[] }).cells[0]!.rowId = 'r9';
    (bad.questions[4] as { answer: { required: number } }).answer.required = 9;
    (bad.questions[5] as { answer: { regionIds: string[] } }).answer.regionIds = ['l4', 'zz'];
    (bad.questions[6] as { answer: { lines: { id: string; indent: number }[] } }).answer.lines[0]!.id = 'd-zero';
    (bad.questions[7] as { answer: { fixes: { segmentId: string }[] } }).answer.fixes[0]!.segmentId = 's99';
    (bad.questions[8] as { answer: { points: { x: number }[] } }).answer.points[0]!.x = 99;
    (bad.questions[9] as { answer: { modelPattern: string } }).answer.modelPattern = '\\d+-\\d+-\\d+';
    const r = validateBatch(bad);
    expect(r.ok).toBe(false);
    const msgs = r.issues.map((i) => i.message).join('\n');
    expect(msgs).toContain('bank item "k404" is used by more than one blank');
    expect(msgs).toContain('blank "fn" has no {{fn}} placeholder in code');
    expect(msgs).toContain('rowId "bubble"');
    expect(msgs).toContain('rowId "r9"');
    expect(msgs).toContain('required (9) exceeds');
    expect(msgs).toContain('regionId "zz"');
    expect(msgs).toContain('permutation of lines[].id');
    expect(msgs).toContain('segmentId "s99"');
    expect(msgs).toContain('lies outside the plane');
    expect(msgs).toContain('modelPattern wrongly matches "2024-1-31"');
  });
});
