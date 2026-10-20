import { distance, pointInShape, withinTolerance } from './geometry';
import { matchesAccepted } from './normalize';
import { compileSafeRegex, testRegexExamples } from './regex';
import type { AnswerPayload, GradeDetail, GradeResult, Question, RecallCardQuestion } from './types';

type Part = NonNullable<GradeDetail['parts']>[number];
const ratio = (parts: Part[]) => (parts.length ? parts.filter((x) => x.correct).length / parts.length : 0);

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x)) && s.size === a.length;
}

/**
 * Authoritative grader. Returns `isCorrect: null` when the question is not objectively
 * gradable (essay) — the learner self-assesses with the rubric instead.
 * Partial credit is reported in `detail` only; it never flips `isCorrect` to true.
 */
export function gradeAnswer(question: Question, payload: AnswerPayload | null | undefined): GradeResult {
  if (!payload || payload.type !== question.type) {
    const manual = question.type === 'essay' || (question.type === 'recall_card' && !question.answer?.acceptedAnswers?.length);
    return { isCorrect: manual ? null : false, gradable: !manual, detail: { note: 'no answer submitted' } };
  }
  switch (question.type) {
    case 'single_choice': {
      const p = payload as Extract<AnswerPayload, { type: 'single_choice' }>;
      const correct = p.choiceId === question.answer.choiceId;
      return {
        isCorrect: correct,
        gradable: true,
        detail: { parts: [{ id: question.answer.choiceId, correct, expected: question.answer.choiceId, given: p.choiceId }] },
      };
    }
    case 'multiple_choice': {
      const p = payload as Extract<AnswerPayload, { type: 'multiple_choice' }>;
      const expected = question.answer.choiceIds;
      const given = [...new Set(p.choiceIds)];
      const parts = question.choices.map((c) => ({
        id: c.id,
        correct: expected.includes(c.id) === given.includes(c.id),
        expected: expected.includes(c.id) ? 'selected' : 'not-selected',
        given: given.includes(c.id) ? 'selected' : 'not-selected',
      }));
      return {
        isCorrect: sameSet(expected, given),
        gradable: true,
        detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length },
      };
    }
    case 'true_false': {
      const p = payload as Extract<AnswerPayload, { type: 'true_false' }>;
      const correct = p.value === question.answer.value;
      return { isCorrect: correct, gradable: true, detail: { parts: [{ id: 'value', correct, expected: String(question.answer.value), given: p.value === null ? null : String(p.value) }] } };
    }
    case 'short_answer': {
      const p = payload as Extract<AnswerPayload, { type: 'short_answer' }>;
      const correct = matchesAccepted(p.text ?? '', question.answer.acceptedAnswers, question.answer.normalization);
      return { isCorrect: correct, gradable: true, detail: { parts: [{ id: 'text', correct, expected: question.answer.acceptedAnswers, given: p.text }] } };
    }
    case 'essay': {
      const p = payload as Extract<AnswerPayload, { type: 'essay' }>;
      const max = question.answer.maxScore;
      let selfScore: number | undefined;
      if (Array.isArray(p.selfScores) && p.selfScores.length === question.answer.rubric.length) {
        selfScore = p.selfScores.reduce((s, v, i) => s + Math.max(0, Math.min(question.answer.rubric[i]!.maxPoints, Number(v) || 0)), 0);
      }
      return { isCorrect: null, gradable: false, detail: { selfScore, maxScore: max, note: 'manual self-assessment' } };
    }
    case 'cloze': {
      const p = payload as Extract<AnswerPayload, { type: 'cloze' }>;
      const parts = question.blanks.map((b) => {
        const given = p.blanks?.[b.id] ?? '';
        return { id: b.id, correct: matchesAccepted(given, b.acceptedAnswers, b.normalization), expected: b.acceptedAnswers, given };
      });
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'ordering': {
      const p = payload as Extract<AnswerPayload, { type: 'ordering' }>;
      const expected = question.answer.orderedIds;
      const given = p.orderedIds ?? [];
      const parts = expected.map((id, i) => ({ id, correct: given[i] === id, expected: id, given: given[i] ?? null }));
      const correct = given.length === expected.length && parts.every((x) => x.correct);
      return { isCorrect: correct, gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'matching': {
      const p = payload as Extract<AnswerPayload, { type: 'matching' }>;
      const givenMap = new Map((p.pairs ?? []).map((x) => [x.leftId, x.rightId] as const));
      const parts = question.answer.pairs.map((pair) => ({
        id: pair.leftId,
        correct: givenMap.get(pair.leftId) === pair.rightId,
        expected: pair.rightId,
        given: givenMap.get(pair.leftId) ?? null,
      }));
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'numeric': {
      const p = payload as Extract<AnswerPayload, { type: 'numeric' }>;
      const { value, tolerance = 0, relativeTolerance = 0 } = question.answer;
      const given = typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null;
      const allowed = Math.max(tolerance, Math.abs(value) * relativeTolerance);
      const correct = given !== null && Math.abs(given - value) <= allowed + 1e-12;
      return { isCorrect: correct, gradable: true, detail: { parts: [{ id: 'value', correct, expected: String(value), given: given === null ? null : String(given) }], note: allowed ? `±${allowed}` : undefined } };
    }
    case 'cloze_select': {
      const p = payload as Extract<AnswerPayload, { type: 'cloze_select' }>;
      const parts = question.blanks.map((b) => ({ id: b.id, correct: p.blanks?.[b.id] === b.answerOptionId, expected: b.answerOptionId, given: p.blanks?.[b.id] ?? null }));
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'statement_set': {
      const p = payload as Extract<AnswerPayload, { type: 'statement_set' }>;
      const parts = question.statements.map((s) => ({ id: s.id, correct: p.values?.[s.id] === s.value, expected: String(s.value), given: p.values?.[s.id] === undefined || p.values?.[s.id] === null ? null : String(p.values[s.id]) }));
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'categorize': {
      const p = payload as Extract<AnswerPayload, { type: 'categorize' }>;
      const parts = question.items.map((it) => ({ id: it.id, correct: p.assignments?.[it.id] === it.categoryId, expected: it.categoryId, given: p.assignments?.[it.id] ?? null }));
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'two_tier': {
      const p = payload as Extract<AnswerPayload, { type: 'two_tier' }>;
      const parts = [
        { id: 'choice', correct: p.choiceId === question.answer.choiceId, expected: question.answer.choiceId, given: p.choiceId },
        { id: 'reason', correct: p.reasonId === question.answer.reasonId, expected: question.answer.reasonId, given: p.reasonId },
      ];
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / 2, note: parts[0]!.correct && !parts[1]!.correct ? 'answer right, reasoning wrong' : !parts[0]!.correct && parts[1]!.correct ? 'reason right, answer wrong' : undefined } };
    }
    case 'recall_card': {
      const p = payload as Extract<AnswerPayload, { type: 'recall_card' }>;
      const accepted = question.answer?.acceptedAnswers;
      if (accepted?.length && typeof p.text === 'string' && p.text.trim()) {
        const correct = matchesAccepted(p.text, accepted, question.answer?.normalization);
        return { isCorrect: correct, gradable: true, detail: { parts: [{ id: 'text', correct, expected: accepted, given: p.text }] } };
      }
      // self-checked: the learner compares with the back side and marks ✓/✗
      return { isCorrect: typeof p.selfCorrect === 'boolean' ? p.selfCorrect : null, gradable: false, detail: { note: 'self-check against the back side' } };
    }
    case 'stepwise': {
      const p = payload as Extract<AnswerPayload, { type: 'stepwise' }>;
      const parts = question.steps.map((s) => {
        const given = p.answers?.[s.id] ?? '';
        return { id: s.id, correct: matchesAccepted(given, s.acceptedAnswers, s.normalization), expected: s.acceptedAnswers, given };
      });
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'highlight': {
      const p = payload as Extract<AnswerPayload, { type: 'highlight' }>;
      const expected = new Set(question.answer.segmentIds);
      const given = new Set(p.segmentIds ?? []);
      const parts = question.segments.map((s) => ({ id: s.id, correct: expected.has(s.id) === given.has(s.id), expected: expected.has(s.id) ? 'selected' : 'not-selected', given: given.has(s.id) ? 'selected' : 'not-selected' }));
      return { isCorrect: sameSet([...expected], [...given]), gradable: true, detail: { parts, partialRatio: parts.filter((x) => x.correct).length / parts.length } };
    }
    case 'cloze_bank': {
      const p = payload as Extract<AnswerPayload, { type: 'cloze_bank' }>;
      const parts = question.blanks.map((b) => ({ id: b.id, correct: p.blanks?.[b.id] === b.bankItemId, expected: b.bankItemId, given: p.blanks?.[b.id] ?? null }));
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: ratio(parts) } };
    }
    case 'code_cloze': {
      const p = payload as Extract<AnswerPayload, { type: 'code_cloze' }>;
      const parts = question.blanks.map((b) => {
        const given = p.blanks?.[b.id] ?? '';
        // code is case-sensitive unless the author says otherwise
        return { id: b.id, correct: matchesAccepted(given, b.acceptedAnswers, { caseFold: false, ...(b.normalization ?? {}) }), expected: b.acceptedAnswers, given };
      });
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: ratio(parts) } };
    }
    case 'matrix': {
      const p = payload as Extract<AnswerPayload, { type: 'matrix' }>;
      const givenByRow = new Map<string, Set<string>>();
      for (const c of p.cells ?? []) {
        if (!givenByRow.has(c.rowId)) givenByRow.set(c.rowId, new Set());
        givenByRow.get(c.rowId)!.add(c.columnId);
      }
      const parts = question.rows.map((r) => {
        const expected = question.answer.cells.filter((c) => c.rowId === r.id).map((c) => c.columnId).sort();
        const given = [...(givenByRow.get(r.id) ?? [])].sort();
        return { id: r.id, correct: sameSet(expected, given), expected, given: given.join(',') };
      });
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: ratio(parts) } };
    }
    case 'numeric_grid': {
      const p = payload as Extract<AnswerPayload, { type: 'numeric_grid' }>;
      const parts = question.cells.map((c) => {
        const raw = p.values?.[c.id];
        const given = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
        return { id: c.id, correct: withinTolerance(given, c.value, c.tolerance, c.relativeTolerance), expected: String(c.value), given: given === null ? null : String(given) };
      });
      return { isCorrect: parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: ratio(parts) } };
    }
    case 'list_answer': {
      const p = payload as Extract<AnswerPayload, { type: 'list_answer' }>;
      const required = question.answer.required ?? question.answer.items.length;
      const used = new Set<string>();
      const entries = (p.entries ?? []).map((e) => (typeof e === 'string' ? e : '')).filter((e) => e.trim().length > 0);
      const parts: Part[] = entries.map((given, i) => {
        const hit = question.answer.items.find((it) => !used.has(it.id) && matchesAccepted(given, it.acceptedAnswers, it.normalization));
        if (hit) used.add(hit.id);
        return { id: `entry-${i + 1}`, correct: !!hit, expected: hit ? hit.id : 'one of the remaining items', given };
      });
      const matched = used.size;
      const wrong = parts.filter((x) => !x.correct).length;
      const isCorrect = matched >= required && wrong === 0;
      return { isCorrect, gradable: true, detail: { parts, partialRatio: Math.min(1, matched / required), note: `${matched}/${required} named${wrong ? `, ${wrong} wrong` : ''}` } };
    }
    case 'image_hotspot': {
      const p = payload as Extract<AnswerPayload, { type: 'image_hotspot' }>;
      const points = (p.points ?? []).filter((pt) => typeof pt?.x === 'number' && typeof pt?.y === 'number');
      const regions = new Map(question.regions.map((r) => [r.id, r]));
      const expectedIds = question.answer.regionIds;
      const consumed = new Set<number>();
      const parts: Part[] = expectedIds.map((rid) => {
        const region = regions.get(rid)!;
        const idx = points.findIndex((pt, i) => !consumed.has(i) && pointInShape(pt, region.shape));
        if (idx >= 0) consumed.add(idx);
        return { id: rid, correct: idx >= 0, expected: region.label ?? rid, given: idx >= 0 ? `${points[idx]!.x.toFixed(3)},${points[idx]!.y.toFixed(3)}` : null };
      });
      points.forEach((pt, i) => { if (!consumed.has(i)) parts.push({ id: `point-${i + 1}`, correct: false, expected: 'no extra marker', given: `${pt.x.toFixed(3)},${pt.y.toFixed(3)}` }); });
      const hits = parts.filter((x) => x.correct).length;
      return { isCorrect: hits === expectedIds.length && consumed.size === points.length, gradable: true, detail: { parts, partialRatio: hits / expectedIds.length } };
    }
    case 'parsons': {
      const p = payload as Extract<AnswerPayload, { type: 'parsons' }>;
      const checkIndent = question.checkIndent !== false;
      const expected = question.answer.lines;
      const given = p.lines ?? [];
      const parts = expected.map((l, i) => {
        const g = given[i];
        const correct = !!g && g.id === l.id && (!checkIndent || g.indent === l.indent);
        return { id: l.id, correct, expected: checkIndent ? `${l.id}@${l.indent}` : l.id, given: g ? (checkIndent ? `${g.id}@${g.indent}` : g.id) : null };
      });
      const isCorrect = given.length === expected.length && parts.every((x) => x.correct);
      const extra = given.length - expected.length;
      return { isCorrect, gradable: true, detail: { parts, partialRatio: ratio(parts), note: extra > 0 ? `${extra} extra line(s)` : extra < 0 ? `${-extra} line(s) missing` : undefined } };
    }
    case 'find_and_fix': {
      const p = payload as Extract<AnswerPayload, { type: 'find_and_fix' }>;
      const given = new Map((p.fixes ?? []).map((f) => [f.segmentId, typeof f.text === 'string' ? f.text : '']));
      const parts: Part[] = question.answer.fixes.map((f) => {
        const has = given.has(f.segmentId);
        const text = given.get(f.segmentId) ?? '';
        const fixed = has && matchesAccepted(text, f.acceptedAnswers, f.normalization);
        return { id: f.segmentId, correct: fixed, expected: f.acceptedAnswers, given: has ? text : null };
      });
      const expectedIds = new Set(question.answer.fixes.map((f) => f.segmentId));
      for (const [sid, text] of given) if (!expectedIds.has(sid)) parts.push({ id: sid, correct: false, expected: 'not an error', given: text });
      const located = question.answer.fixes.filter((f) => given.has(f.segmentId)).length;
      const isCorrect = parts.every((x) => x.correct);
      return { isCorrect, gradable: true, detail: { parts, partialRatio: ratio(parts), note: `${located}/${question.answer.fixes.length} located` } };
    }
    case 'coordinate_point': {
      const p = payload as Extract<AnswerPayload, { type: 'coordinate_point' }>;
      const points = (p.points ?? []).filter((pt) => typeof pt?.x === 'number' && typeof pt?.y === 'number' && Number.isFinite(pt.x) && Number.isFinite(pt.y));
      const consumed = new Set<number>();
      const parts: Part[] = question.answer.points.map((ex) => {
        let best = -1;
        let bestD = Infinity;
        points.forEach((pt, i) => { if (consumed.has(i)) return; const d = distance(pt, ex); if (d < bestD) { bestD = d; best = i; } });
        const ok = best >= 0 && bestD <= (ex.tolerance ?? 0) + 1e-9;
        if (ok) consumed.add(best);
        return { id: ex.id, correct: ok, expected: `(${ex.x}, ${ex.y})`, given: ok ? `(${points[best]!.x}, ${points[best]!.y})` : null };
      });
      points.forEach((pt, i) => { if (!consumed.has(i)) parts.push({ id: `point-${i + 1}`, correct: false, expected: 'no extra point', given: `(${pt.x}, ${pt.y})` }); });
      const hits = parts.filter((x) => x.correct).length;
      return { isCorrect: hits === question.answer.points.length && consumed.size === points.length, gradable: true, detail: { parts, partialRatio: hits / question.answer.points.length } };
    }
    case 'regex_answer': {
      const p = payload as Extract<AnswerPayload, { type: 'regex_answer' }>;
      const pattern = typeof p.pattern === 'string' ? p.pattern : '';
      const compiled = compileSafeRegex(pattern, question.answer.flags ?? '', question.answer.fullMatch ?? false);
      const results = testRegexExamples(compiled, question.answer.shouldMatch, question.answer.shouldNotMatch);
      const parts = results.map((r) => ({ id: r.id, correct: r.correct, expected: r.expected ? 'match' : 'no match', given: r.matched === null ? null : r.matched ? 'match' : 'no match' }));
      return { isCorrect: !!compiled.re && parts.every((x) => x.correct), gradable: true, detail: { parts, partialRatio: compiled.re ? ratio(parts) : 0, note: compiled.error ? `pattern rejected: ${compiled.error}` : undefined } };
    }
  }
}

/** Essay is always manual; recall_card is manual unless it carries acceptedAnswers. */
export function isObjectivelyGradable(q: Pick<Question, 'type'> & { answer?: unknown }): boolean {
  if (q.type === 'essay') return false;
  if (q.type === 'recall_card') return !!((q as RecallCardQuestion).answer?.acceptedAnswers?.length);
  return true;
}
