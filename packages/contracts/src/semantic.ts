import { extractClozeIds } from './normalize';
import { compileSafeRegex, testRegexExamples } from './regex';
import type { Question, QuestionBatch } from './types';
import type { ValidationIssue } from './schema';

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  const d = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) d.add(id);
    seen.add(id);
  }
  return [...d];
}

function issue(path: string, qi: number, qid: string, message: string): ValidationIssue {
  return { path, questionIndex: qi, questionId: qid, message, kind: 'semantic' };
}

/**
 * Cross-reference invariants that JSON Schema cannot express (see schema `$comment`).
 * Assumes the input already passed schema validation.
 */
export function validateQuestionSemantics(q: Question, qi: number): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const base = `/questions/${qi}`;
  const push = (p: string, m: string) => out.push(issue(base + p, qi, q.id, m));

  switch (q.type) {
    case 'single_choice': {
      const ids = q.choices.map((c) => c.id);
      for (const d of dupes(ids)) push('/choices', `duplicate choice id "${d}"`);
      if (!ids.includes(q.answer.choiceId))
        push('/answer/choiceId', `answer choiceId "${q.answer.choiceId}" is not one of the choices`);
      break;
    }
    case 'multiple_choice': {
      const ids = q.choices.map((c) => c.id);
      for (const d of dupes(ids)) push('/choices', `duplicate choice id "${d}"`);
      for (const a of q.answer.choiceIds)
        if (!ids.includes(a)) push('/answer/choiceIds', `answer choiceId "${a}" is not one of the choices`);
      if (q.answer.choiceIds.length < 2) push('/answer/choiceIds', 'multiple_choice needs at least 2 correct choices');
      if (q.answer.choiceIds.length >= ids.length)
        push('/answer/choiceIds', 'multiple_choice needs at least one incorrect choice (answers must be a proper subset)');
      break;
    }
    case 'true_false':
    case 'short_answer':
      break;
    case 'essay': {
      const sum = q.answer.rubric.reduce((s, r) => s + r.maxPoints, 0);
      if (sum !== q.answer.maxScore)
        push('/answer/rubric', `rubric maxPoints sum (${sum}) must equal answer.maxScore (${q.answer.maxScore})`);
      const segs = q.answer.modelAnswerSegments;
      if (segs) {
        const perCriterion = new Map<number, number>();
        segs.forEach((g, gi) => {
          if ((g.points === undefined) !== (g.rubricIndex === undefined)) { push(`/answer/modelAnswerSegments/${gi}`, 'points and rubricIndex must be given together'); return; }
          if (g.rubricIndex === undefined || g.points === undefined) return;
          if (g.rubricIndex >= q.answer.rubric.length) { push(`/answer/modelAnswerSegments/${gi}/rubricIndex`, `rubricIndex ${g.rubricIndex} is out of range (rubric has ${q.answer.rubric.length} items)`); return; }
          perCriterion.set(g.rubricIndex, (perCriterion.get(g.rubricIndex) ?? 0) + g.points);
        });
        if (!segs.some((g) => g.points !== undefined)) push('/answer/modelAnswerSegments', 'modelAnswerSegments needs at least one scored segment (points + rubricIndex)');
        for (const [i, pts] of perCriterion) {
          const max = q.answer.rubric[i]!.maxPoints;
          if (pts > max) push('/answer/modelAnswerSegments', `segment points for rubric[${i}] (${pts}) exceed its maxPoints (${max})`);
        }
      }
      break;
    }
    case 'cloze': {
      const blankIds = q.blanks.map((b) => b.id);
      for (const d of dupes(blankIds)) push('/blanks', `duplicate blank id "${d}"`);
      const inPrompt = extractClozeIds(q.prompt);
      for (const d of dupes(inPrompt)) push('/prompt', `placeholder {{${d}}} appears more than once`);
      const promptSet = new Set(inPrompt);
      const blankSet = new Set(blankIds);
      for (const id of blankSet) if (!promptSet.has(id)) push('/prompt', `blank "${id}" has no {{${id}}} placeholder in prompt`);
      for (const id of promptSet) if (!blankSet.has(id)) push('/blanks', `placeholder {{${id}}} has no matching blank definition`);
      break;
    }
    case 'ordering': {
      const itemIds = q.items.map((i) => i.id);
      for (const d of dupes(itemIds)) push('/items', `duplicate item id "${d}"`);
      const a = q.answer.orderedIds;
      const sameLen = a.length === itemIds.length;
      const allKnown = a.every((id) => itemIds.includes(id));
      if (!sameLen || !allKnown || new Set(a).size !== a.length)
        push('/answer/orderedIds', 'orderedIds must be a permutation of items[].id');
      break;
    }
    case 'matching': {
      const l = q.left.map((i) => i.id);
      const r = q.right.map((i) => i.id);
      for (const d of dupes(l)) push('/left', `duplicate left id "${d}"`);
      for (const d of dupes(r)) push('/right', `duplicate right id "${d}"`);
      const pl = q.answer.pairs.map((p) => p.leftId);
      const pr = q.answer.pairs.map((p) => p.rightId);
      for (const d of dupes(pl)) push('/answer/pairs', `left id "${d}" is paired more than once`);
      for (const d of dupes(pr)) push('/answer/pairs', `right id "${d}" is paired more than once`);
      for (const id of pl) if (!l.includes(id)) push('/answer/pairs', `leftId "${id}" is not in left`);
      for (const id of pr) if (!r.includes(id)) push('/answer/pairs', `rightId "${id}" is not in right`);
      if (!(pl.length === l.length && pl.length === r.length))
        push('/answer/pairs', 'pairs must form a 1:1 bijection between every left and right item');
      break;
    }
    case 'numeric': {
      if (q.answer.tolerance !== undefined && q.answer.relativeTolerance !== undefined && q.answer.tolerance === 0 && q.answer.relativeTolerance === 0)
        push('/answer', 'tolerance and relativeTolerance are both 0; use exact matching by omitting them');
      if (!Number.isFinite(q.answer.value)) push('/answer/value', 'value must be a finite number');
      break;
    }
    case 'cloze_select': {
      const blankIds = q.blanks.map((b) => b.id);
      for (const d of dupes(blankIds)) push('/blanks', `duplicate blank id "${d}"`);
      const inPrompt = extractClozeIds(q.prompt);
      for (const d of dupes(inPrompt)) push('/prompt', `placeholder {{${d}}} appears more than once`);
      const promptSet = new Set(inPrompt);
      const blankSet = new Set(blankIds);
      for (const id of blankSet) if (!promptSet.has(id)) push('/prompt', `blank "${id}" has no {{${id}}} placeholder in prompt`);
      for (const id of promptSet) if (!blankSet.has(id)) push('/blanks', `placeholder {{${id}}} has no matching blank definition`);
      q.blanks.forEach((b, i) => {
        const ids = b.options.map((o) => o.id);
        for (const d of dupes(ids)) push(`/blanks/${i}/options`, `duplicate option id "${d}"`);
        if (!ids.includes(b.answerOptionId)) push(`/blanks/${i}/answerOptionId`, `answerOptionId "${b.answerOptionId}" is not one of the options`);
      });
      break;
    }
    case 'statement_set': {
      for (const d of dupes(q.statements.map((s) => s.id))) push('/statements', `duplicate statement id "${d}"`);
      break;
    }
    case 'categorize': {
      const cats = q.categories.map((c) => c.id);
      for (const d of dupes(cats)) push('/categories', `duplicate category id "${d}"`);
      for (const d of dupes(q.items.map((i) => i.id))) push('/items', `duplicate item id "${d}"`);
      q.items.forEach((it, i) => { if (!cats.includes(it.categoryId)) push(`/items/${i}/categoryId`, `categoryId "${it.categoryId}" is not one of the categories`); });
      break;
    }
    case 'two_tier': {
      const c = q.choices.map((x) => x.id);
      const r = q.reasons.map((x) => x.id);
      for (const d of dupes(c)) push('/choices', `duplicate choice id "${d}"`);
      for (const d of dupes(r)) push('/reasons', `duplicate reason id "${d}"`);
      if (!c.includes(q.answer.choiceId)) push('/answer/choiceId', `answer choiceId "${q.answer.choiceId}" is not one of the choices`);
      if (!r.includes(q.answer.reasonId)) push('/answer/reasonId', `answer reasonId "${q.answer.reasonId}" is not one of the reasons`);
      break;
    }
    case 'recall_card': {
      if (q.answer?.acceptedAnswers && q.answer.acceptedAnswers.length === 0) push('/answer/acceptedAnswers', 'acceptedAnswers must not be empty when present');
      break;
    }
    case 'stepwise': {
      for (const d of dupes(q.steps.map((s) => s.id))) push('/steps', `duplicate step id "${d}"`);
      break;
    }
    case 'highlight': {
      const ids = q.segments.map((s) => s.id);
      for (const d of dupes(ids)) push('/segments', `duplicate segment id "${d}"`);
      for (const id of q.answer.segmentIds) if (!ids.includes(id)) push('/answer/segmentIds', `segmentId "${id}" is not one of the segments`);
      if (q.answer.segmentIds.length >= ids.length) push('/answer/segmentIds', 'highlight needs at least one non-answer segment');
      break;
    }
    case 'cloze_bank': {
      const bankIds = q.bank.map((b) => b.id);
      for (const d of dupes(bankIds)) push('/bank', `duplicate bank item id "${d}"`);
      const blankIds = q.blanks.map((b) => b.id);
      for (const d of dupes(blankIds)) push('/blanks', `duplicate blank id "${d}"`);
      const inPrompt = extractClozeIds(q.prompt);
      for (const d of dupes(inPrompt)) push('/prompt', `placeholder {{${d}}} appears more than once`);
      const promptSet = new Set(inPrompt);
      const blankSet = new Set(blankIds);
      for (const id of blankSet) if (!promptSet.has(id)) push('/prompt', `blank "${id}" has no {{${id}}} placeholder in prompt`);
      for (const id of promptSet) if (!blankSet.has(id)) push('/blanks', `placeholder {{${id}}} has no matching blank definition`);
      q.blanks.forEach((b, i) => { if (!bankIds.includes(b.bankItemId)) push(`/blanks/${i}/bankItemId`, `bankItemId "${b.bankItemId}" is not in the bank`); });
      for (const d of dupes(q.blanks.map((b) => b.bankItemId))) push('/blanks', `bank item "${d}" is used by more than one blank`);
      if (q.bank.length < q.blanks.length) push('/bank', 'bank must contain at least as many items as there are blanks');
      break;
    }
    case 'code_cloze': {
      const blankIds = q.blanks.map((b) => b.id);
      for (const d of dupes(blankIds)) push('/blanks', `duplicate blank id "${d}"`);
      const inCode = extractClozeIds(q.code);
      for (const d of dupes(inCode)) push('/code', `placeholder {{${d}}} appears more than once`);
      const codeSet = new Set(inCode);
      const blankSet = new Set(blankIds);
      for (const id of blankSet) if (!codeSet.has(id)) push('/code', `blank "${id}" has no {{${id}}} placeholder in code`);
      for (const id of codeSet) if (!blankSet.has(id)) push('/blanks', `placeholder {{${id}}} has no matching blank definition`);
      break;
    }
    case 'matrix': {
      const rows = q.rows.map((r) => r.id);
      const cols = q.columns.map((c) => c.id);
      for (const d of dupes(rows)) push('/rows', `duplicate row id "${d}"`);
      for (const d of dupes(cols)) push('/columns', `duplicate column id "${d}"`);
      q.answer.cells.forEach((c, i) => {
        if (!rows.includes(c.rowId)) push(`/answer/cells/${i}/rowId`, `rowId "${c.rowId}" is not one of the rows`);
        if (!cols.includes(c.columnId)) push(`/answer/cells/${i}/columnId`, `columnId "${c.columnId}" is not one of the columns`);
      });
      for (const d of dupes(q.answer.cells.map((c) => `${c.rowId}:${c.columnId}`))) push('/answer/cells', `cell "${d}" is listed more than once`);
      if (q.selection === 'single') {
        for (const r of rows) {
          const n = q.answer.cells.filter((c) => c.rowId === r).length;
          if (n !== 1) push('/answer/cells', `selection "single" needs exactly one cell for row "${r}" (found ${n})`);
        }
      }
      break;
    }
    case 'numeric_grid': {
      const rows = q.rows.map((r) => r.id);
      const cols = q.columns.map((c) => c.id);
      for (const d of dupes(rows)) push('/rows', `duplicate row id "${d}"`);
      for (const d of dupes(cols)) push('/columns', `duplicate column id "${d}"`);
      for (const d of dupes(q.cells.map((c) => c.id))) push('/cells', `duplicate cell id "${d}"`);
      q.cells.forEach((c, i) => {
        if (!rows.includes(c.rowId)) push(`/cells/${i}/rowId`, `rowId "${c.rowId}" is not one of the rows`);
        if (!cols.includes(c.columnId)) push(`/cells/${i}/columnId`, `columnId "${c.columnId}" is not one of the columns`);
        if (!Number.isFinite(c.value)) push(`/cells/${i}/value`, 'value must be a finite number');
      });
      (q.given ?? []).forEach((g, i) => {
        if (!rows.includes(g.rowId)) push(`/given/${i}/rowId`, `rowId "${g.rowId}" is not one of the rows`);
        if (!cols.includes(g.columnId)) push(`/given/${i}/columnId`, `columnId "${g.columnId}" is not one of the columns`);
      });
      const positions = [...q.cells.map((c) => `${c.rowId}:${c.columnId}`), ...(q.given ?? []).map((g) => `${g.rowId}:${g.columnId}`)];
      for (const d of dupes(positions)) push('/cells', `row×column "${d}" is used more than once (cells + given)`);
      break;
    }
    case 'list_answer': {
      for (const d of dupes(q.answer.items.map((i) => i.id))) push('/answer/items', `duplicate item id "${d}"`);
      if (q.answer.required !== undefined && q.answer.required > q.answer.items.length) push('/answer/required', `required (${q.answer.required}) exceeds the number of items (${q.answer.items.length})`);
      break;
    }
    case 'image_hotspot': {
      const hasUrl = typeof q.image.url === 'string';
      const hasSvg = typeof q.image.svg === 'string';
      if (hasUrl === hasSvg) push('/image', 'image needs exactly one of url / svg');
      if (hasSvg && !/^\s*<svg[\s>]/i.test(q.image.svg!)) push('/image/svg', 'svg must be inline <svg …> markup');
      const ids = q.regions.map((r) => r.id);
      for (const d of dupes(ids)) push('/regions', `duplicate region id "${d}"`);
      for (const id of q.answer.regionIds) if (!ids.includes(id)) push('/answer/regionIds', `regionId "${id}" is not one of the regions`);
      q.regions.forEach((r, i) => {
        const s = r.shape;
        if (s.kind === 'rect' && (s.x + s.w > 1 + 1e-9 || s.y + s.h > 1 + 1e-9)) push(`/regions/${i}/shape`, 'rect exceeds the image bounds (0..1)');
        if (s.kind === 'rect' && (s.w === 0 || s.h === 0)) push(`/regions/${i}/shape`, 'rect must have a non-zero width and height');
      });
      break;
    }
    case 'parsons': {
      const lineIds = q.lines.map((l) => l.id);
      const dIds = (q.distractors ?? []).map((d) => d.id);
      for (const d of dupes([...lineIds, ...dIds])) push('/lines', `duplicate line id "${d}" (lines + distractors)`);
      const a = q.answer.lines.map((l) => l.id);
      if (a.length !== lineIds.length || new Set(a).size !== a.length || !a.every((id) => lineIds.includes(id)))
        push('/answer/lines', 'answer.lines ids must be a permutation of lines[].id (distractors never appear in the answer)');
      if (q.answer.lines[0] && q.answer.lines[0].indent !== 0) push('/answer/lines/0/indent', 'the first line must have indent 0');
      q.answer.lines.forEach((l, i) => { if (i > 0 && l.indent > q.answer.lines[i - 1]!.indent + 1) push(`/answer/lines/${i}/indent`, 'indent may grow by at most one level per line'); });
      break;
    }
    case 'find_and_fix': {
      const ids = q.segments.map((s) => s.id);
      for (const d of dupes(ids)) push('/segments', `duplicate segment id "${d}"`);
      const fixIds = q.answer.fixes.map((f) => f.segmentId);
      for (const d of dupes(fixIds)) push('/answer/fixes', `segment "${d}" is fixed more than once`);
      for (const id of fixIds) if (!ids.includes(id)) push('/answer/fixes', `segmentId "${id}" is not one of the segments`);
      if (new Set(fixIds).size >= ids.length) push('/answer/fixes', 'find_and_fix needs at least one segment that is not an error');
      break;
    }
    case 'coordinate_point': {
      const { xMin, xMax, yMin, yMax, xStep, yStep } = q.plane;
      if (!(xMax > xMin)) push('/plane', 'xMax must be greater than xMin');
      if (!(yMax > yMin)) push('/plane', 'yMax must be greater than yMin');
      if (xStep !== undefined && (xMax - xMin) / xStep > 200) push('/plane/xStep', 'too many grid steps on x (max 200)');
      if (yStep !== undefined && (yMax - yMin) / yStep > 200) push('/plane/yStep', 'too many grid steps on y (max 200)');
      for (const d of dupes(q.answer.points.map((p) => p.id))) push('/answer/points', `duplicate point id "${d}"`);
      q.answer.points.forEach((p, i) => {
        if (p.x < xMin || p.x > xMax || p.y < yMin || p.y > yMax) push(`/answer/points/${i}`, `point "${p.id}" lies outside the plane`);
      });
      break;
    }
    case 'regex_answer': {
      const neg = new Set(q.answer.shouldNotMatch);
      for (const s of q.answer.shouldMatch) if (neg.has(s)) push('/answer', `"${s}" is listed in both shouldMatch and shouldNotMatch`);
      if (q.answer.modelPattern !== undefined) {
        const compiled = compileSafeRegex(q.answer.modelPattern, q.answer.flags ?? '', q.answer.fullMatch ?? false);
        if (!compiled.re) push('/answer/modelPattern', `modelPattern is not usable: ${compiled.error}`);
        else {
          const failing = testRegexExamples(compiled, q.answer.shouldMatch, q.answer.shouldNotMatch).filter((r) => !r.correct);
          for (const f of failing) push('/answer/modelPattern', `modelPattern ${f.expected ? 'does not match' : 'wrongly matches'} "${f.text}"`);
        }
      }
      break;
    }
  }
  if (q.explanation.summary.trim().length === 0) push('/explanation/summary', 'explanation summary must not be blank');
  return out;
}

export function validateBatchSemantics(batch: QuestionBatch): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const d of dupes(batch.questions.map((q) => q.id)))
    out.push({ path: '/questions', message: `duplicate question id "${d}" within deck`, kind: 'semantic' });
  batch.questions.forEach((q, i) => out.push(...validateQuestionSemantics(q, i)));
  return out;
}
