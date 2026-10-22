import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gradeAnswer, toPublicQuestion, type Question, type AnswerPayload } from '@recall/contracts';

const batch = JSON.parse(readFileSync(join(__dirname, '../../../examples/example-question-batch.json'), 'utf8'));
const questions = (batch.questions as Question[]).filter((q) => ['short_answer', 'essay', 'cloze'].includes(q.type));
const settings = {
  mobileSubmitOnRight: false,
  shortcutsEnabled: true, shuffleChoices: false, autoAdvanceAfterRating: false, dailyReviewGoal: 50,
  showIntervalPreview: true, hideDifficulty: false, hideTags: false, hideSubject: false, hideSource: false,
  hideRound: false, revealMetaOnAnswer: false, essayAnswerView: 'plain', promptDefaults: null,
};

async function mockApp(page: Page) {
  let savedSettings = { ...settings };
  await page.context().addCookies([{ name: 'authjs.session-token', value: 'ui-test-session', url: process.env.E2E_BASE_URL ?? 'http://localhost:3000' }]);
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (!['fetch', 'xhr'].includes(request.resourceType())) return route.continue();
    // Next route payloads may use the same path as API resources; let them reach the web server.
    if (request.headers()['rsc'] === '1') return route.continue();
    const path = new URL(request.url()).pathname;
    const json = (value: unknown) => route.fulfill({ json: value });
    if (path === '/api/auth/session') return json({ user: { name: 'UI tester', email: 'ui@test.local' }, expires: '2099-01-01' });
    if (path === '/api/token') return json({ token: 'ui-test', expiresAt: Date.now() + 3600_000 });
    if (path === '/settings') {
      if (request.method() === 'PATCH') savedSettings = { ...savedSettings, ...request.postDataJSON() };
      return json(savedSettings);
    }
    if (path === '/shares/received/count') return json({ pending: 2 });
    if (path === '/decks') return json([{ id: 'deck', slug: 'a_very_long_deck_identifier_for_layout_testing', title: '아주 긴 덱 제목으로 모바일 선택 항목을 확인합니다 '.repeat(3), subject: '모바일 레이아웃 테스트', progress: { total: 3 } }]);
    if (path === '/subjects' || path.endsWith('/subjects')) return json([]);
    if (path === '/study/queue') return json({
      scope: 'all', mode: 'cram', deck: null, counts: { total: questions.length },
      items: questions.map((q) => ({ questionId: q.id, externalId: q.id, question: toPublicQuestion(q), type: q.type,
        deck: { id: 'deck', title: '모바일 테스트', subject: '과목' }, hasHint: true, reviewRound: 1, noteCount: 0,
        card: { status: 'NEW', version: 0, flagged: false }, preview: null })),
    });
    if (path.endsWith('/notes')) return json({ notes: [] });
    if (path.endsWith('/hint')) return json({ hint: '모바일 힌트' });
    if (path === '/study/sessions') return json({ id: 'ui-session' });
    if (path.endsWith('/end')) return json({});
    if (path.endsWith('/grade')) {
      const q = questions.find((q) => path.includes(q.id))!;
      const payload = request.postDataJSON() as { answerPayload: AnswerPayload | null };
      return json({ questionId: q.id, grade: gradeAnswer(q, payload.answerPayload), explanation: { ...q.explanation, summary: (q.explanation.summary + '\n\n').repeat(8) }, answerKey: q.type === 'cloze' ? { type: q.type, blanks: q.blanks } : { type: q.type, answer: q.answer } });
    }
    if (/^\/questions\/[^/]+$/.test(path)) return json({ question: questions.find((q) => path.endsWith(q.id)) });
    if (path === '/reviews') return json({ review: { id: 'review' }, card: { status: 'REVIEW', version: 1 }, reviewRound: 2 });
    if (path === '/exams/ui-test') return json({ id: 'ui-test', title: '모바일 시험', startedAt: new Date().toISOString(), config: {}, questions: questions.map((q) => ({ questionId: q.id, type: q.type, question: toPublicQuestion(q) })) });
    if (new URL(request.url()).origin !== new URL(page.url()).origin) throw new Error(`Unmocked API: ${path}`);
    return route.continue();
  });
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))).toEqual({ width: page.viewportSize()!.width, content: page.viewportSize()!.width });
}

async function expectActions(page: Page, mobile = page.viewportSize()!.width < 768) {
  const actions = page.getByTestId('study-actions');
  await expect(actions).toBeVisible();
  await expect(actions).toHaveCSS('position', mobile ? 'fixed' : 'static');
  if (mobile) {
    const box = (await actions.boundingBox())!;
    expect(box.y + box.height).toBeCloseTo(page.viewportSize()!.height, 0);
    expect(box.width).toBe(page.viewportSize()!.width);
  }
}

async function mockSidebarCollections(page: Page) {
  const progress = { total: 8, new: 7, learning: 1, review: 0, relearning: 0, dueToday: 0, flagged: 0, suspended: 0 };
  const rows = Array.from({ length: 9 }, (_, i) => ({
    id: String(i),
    lastReviewedAt: i === 0 ? null : `2026-10-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    archivedAt: i === 8 ? '2026-10-20T10:00:00Z' : null,
    createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z', deletedAt: null,
    description: null, progress,
  }));
  const name = (i: string) => `과목 ${i} ${i === '7' ? '긴 과목 이름으로 모바일 줄바꿈과 너비 확인' : ''}`.trim();
  const decks = rows.map((row) => ({ ...row, id: `deck-${row.id}`, slug: `deck_${row.id}`, title: `덱 ${row.id}`, subject: name(row.id), tags: [], language: 'ko', noteCount: 0, questionTags: [] }));
  const subjects = rows.map((row) => ({ ...row, id: `subject-${row.id}`, name: name(row.id), color: null, questionCount: 8, deckIds: [`deck-${row.id}`] }));
  await page.route('**/*', async (route) => {
    if (!['fetch', 'xhr'].includes(route.request().resourceType())) return route.fallback();
    if (route.request().headers()['rsc'] === '1') return route.fallback();
    const path = new URL(route.request().url()).pathname;
    if (path === '/decks') return route.fulfill({ json: decks });
    if (path === '/subjects') return route.fulfill({ json: subjects });
    if (path === '/decks/deck-7') return route.fulfill({ json: decks[7] });
    if (path === '/decks/deck-7/questions') return route.fulfill({ json: { page: 1, pageSize: 50, total: 0, items: [] } });
    return route.fallback();
  });
  return { subjectName: name('7') };
}

test.beforeEach(async ({ page }) => { await mockApp(page); });

test('mobile zoom guards retain single-finger scrolling', async ({ page }) => {
  await page.goto('/study/all?mode=cram');
  await expect(page.getByTestId('study-actions')).toBeVisible();
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /maximum-scale=1/);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /user-scalable=no/);
  await expect(page.locator('html')).toHaveCSS('touch-action', 'pan-x pan-y');
  const prevented = await page.evaluate(() => {
    const gesture = new Event('gesturestart', { cancelable: true });
    document.dispatchEvent(gesture);
    const scroll = new Event('touchmove', { cancelable: true });
    Object.defineProperty(scroll, 'touches', { value: [{}] });
    document.dispatchEvent(scroll);
    const pinch = new Event('touchmove', { cancelable: true });
    Object.defineProperty(pinch, 'touches', { value: [{}, {}] });
    document.dispatchEvent(pinch);
    return { gesture: gesture.defaultPrevented, scroll: scroll.defaultPrevented, pinch: pinch.defaultPrevented };
  });
  expect(prevented).toEqual({ gesture: true, scroll: false, pinch: true });
});

test('saved mobile submit side swaps only the two answer buttons and survives reload', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('모바일 제출 버튼 위치', { exact: true }).selectOption('right');
  await page.getByTestId('save-settings').click();
  await expect(page.getByText('설정을 저장했습니다', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('모바일 제출 버튼 위치', { exact: true })).toHaveValue('right');
  await page.goto('/study/all?mode=cram');
  const submit = page.getByTestId('submit-btn');
  const reveal = page.getByTestId('reveal-btn');
  await expect(submit).toBeVisible();
  const mobile = page.viewportSize()!.width < 768;
  await expect(submit).toHaveCSS('order', mobile ? '2' : '0');
  await expect(reveal).toHaveCSS('order', mobile ? '1' : '0');
  const a = (await submit.boundingBox())!;
  const b = (await reveal.boundingBox())!;
  expect(a.x > b.x).toBe(mobile);
  await reveal.click();
  await expect(page.getByTestId('rating-bar')).toBeVisible();
  await expectNoOverflow(page);
  await page.goto('/settings');
  await page.getByLabel('모바일 제출 버튼 위치', { exact: true }).selectOption('left');
  await page.getByTestId('save-settings').click();
  await expect(page.getByText('설정을 저장했습니다', { exact: true })).toBeVisible();
  await page.goto('/study/all?mode=cram');
  await expect(submit).toBeVisible();
  expect((await submit.boundingBox())!.x).toBeLessThan((await reveal.boundingBox())!.x);
});

test('completed subject sessions fetch a new queue while reload preserves the current order', async ({ page }) => {
  let requests = 0;
  await page.route('**/analytics/**', (route) => route.fulfill({ status: 503, json: { message: 'offline' } }));
  await page.route('**/study/queue?*', async (route) => {
    requests++;
    const ordered = requests === 1 ? questions : [...questions].reverse();
    await route.fulfill({ json: { scope: 'all', mode: 'scheduled', counts: { total: questions.length },
      items: ordered.map((q) => ({ questionId: q.id, externalId: q.id, question: toPublicQuestion(q), type: q.type,
        deck: { id: 'deck', title: '모바일 테스트', subject: '과목' }, hasHint: false, reviewRound: 1, noteCount: 0,
        card: { status: 'NEW', version: 0, flagged: false }, preview: null })),
    } });
  });
  await page.goto('/study/all?subject=과목');
  await expect(page.getByTestId('study-screen')).toHaveAttribute('data-question-id', questions[0]!.id);
  await page.reload();
  await expect.poll(() => requests).toBe(2);
  await expect(page.getByTestId('study-screen')).toHaveAttribute('data-question-id', questions[0]!.id);
  for (const q of questions) {
    await expect(page.getByTestId('study-screen')).toHaveAttribute('data-question-id', q.id);
    await page.getByTestId('reveal-btn').click();
    await page.getByTestId('rating-bar').locator('[data-rating="3"]').click();
    await page.getByTestId('next-btn').click();
  }
  await expect(page.getByTestId('session-summary')).toBeVisible();
  await page.getByRole('link', { name: '대시보드로', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.goBack();
  await expect.poll(() => requests).toBe(3);
  await expect(page.getByTestId('study-screen')).toHaveAttribute('data-question-id', questions.at(-1)!.id);
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test('slow loads and saves explain progress, recover from errors, and stop on completion', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.clock.install();
  const initial = deferred();
  const saving = deferred();
  let fail = true;
  await page.route('**/settings', async (route) => {
    if (!['fetch', 'xhr'].includes(route.request().resourceType())) return route.fallback();
    if (route.request().headers()['rsc'] === '1') return route.fallback();
    if (route.request().method() === 'GET') await initial.promise;
    if (route.request().method() === 'PATCH' && fail) {
      await saving.promise;
      fail = false;
      return route.fulfill({ status: 500, json: { message: '테스트: 잠시 후 다시 시도하세요' } });
    }
    return route.fallback();
  });
  await page.goto('/settings');
  await expect(page.getByText('설정을 불러오는 중…', { exact: true })).toBeVisible();
  await page.clock.fastForward(6_100);
  await expect(page.getByTestId('request-feedback')).toBeVisible();
  await expect(page.getByTestId('request-feedback')).toContainText('서버 응답을 기다리고 있습니다');
  await expect(page.getByTestId('request-feedback').getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  await expectNoOverflow(page);
  initial.resolve();
  const save = page.getByTestId('save-settings');
  await expect(save).toBeEnabled();
  await expect(page.getByTestId('request-feedback')).toBeHidden();
  await save.click();
  await expect(save).toHaveAttribute('aria-busy', 'true');
  await expect(save).toBeDisabled();
  await expect(save).toHaveText('저장 중…');
  await page.clock.fastForward(400);
  await expect(page.getByTestId('request-feedback')).toContainText('서버에서 처리 중');
  await expectNoOverflow(page);
  await page.screenshot({ path: `/tmp/recall-loading-save-${page.viewportSize()!.width}.png` });
  saving.resolve();
  await expect(page.getByText('저장 실패', { exact: true })).toBeVisible();
  await expect(save).toBeEnabled();
  await expect(save).not.toHaveAttribute('aria-busy');
  await expect(page.getByTestId('request-feedback')).toBeHidden();
  await save.click();
  await expect(page.getByText('설정을 저장했습니다', { exact: true })).toBeVisible();
  await expect(save).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test('batch import shows measured per-file progress instead of a guessed percentage', async ({ page }) => {
  const first = deferred();
  const second = deferred();
  let requests = 0;
  await page.route('**/imports/validate', async (route) => {
    const gate = requests++ === 0 ? first : second;
    await gate.promise;
    return route.fulfill({ json: { ok: true, issues: [], counts: { created: 8, updated: 0, unchanged: 0, resetSchedule: 0, deactivated: 0, skipped: 0 } } });
  });
  await page.goto('/import');
  await page.getByTestId('tab-multi').click();
  await page.getByTestId('multi-file-input').setInputFiles([1, 2].map((i) => ({ name: `batch-${i}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...batch, deck: { ...batch.deck, id: `loading_${i}` } })) })));
  await page.getByTestId('multi-validate-btn').click();
  const progress = page.getByTestId('multi-progress');
  await expect(progress).toContainText('0 / 2개 완료');
  await expect(progress.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  first.resolve();
  await expect(progress).toContainText('1 / 2개 완료');
  await expect(progress.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  await expect(page.getByTestId('multi-validate-btn')).toHaveAttribute('aria-busy', 'true');
  await expectNoOverflow(page);
  await page.screenshot({ path: `/tmp/recall-loading-import-${page.viewportSize()!.width}.png` });
  second.resolve();
  await expect(progress).toBeHidden();
  await expect(page.getByTestId('multi-validate-btn')).not.toHaveAttribute('aria-busy');
  await expect(page.getByText('검증 완료 — 2/2개 파일 통과', { exact: true })).toBeVisible();
});

test('slow page navigation gives feedback before the destination responds', async ({ page }) => {
  await mockSidebarCollections(page);
  const navigation = deferred();
  await page.route('**/subjects?*', async (route) => {
    if (route.request().headers()['rsc'] === '1') await navigation.promise;
    return route.fallback();
  });
  await page.goto('/prompt');
  if (page.viewportSize()!.width < 768) await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  const sidebar = page.getByTestId('sidebar');
  await sidebar.getByRole('button', { name: '과목', exact: true }).click();
  await sidebar.getByRole('link', { name: '전체 과목 보기', exact: true }).click();
  await expect(page.getByText('페이지 여는 중…', { exact: true }).or(page.getByText('페이지를 준비하는 중…', { exact: true })).first()).toBeVisible();
  navigation.resolve();
  await expect(page).toHaveURL(/\/subjects$/);
  await expect(page.getByRole('heading', { name: '과목', exact: true })).toBeVisible();
  await expect(page.getByTestId('request-feedback')).toBeHidden();
});

test('delayed grading and rating show feedback on the active study control', async ({ page }) => {
  const grading = deferred();
  const rating = deferred();
  await page.route('**/questions/*/grade', async (route) => { await grading.promise; return route.fallback(); });
  await page.route('**/reviews', async (route) => { await rating.promise; return route.fallback(); });
  await page.goto('/study/all?mode=cram');
  await expect(page.getByTestId('study-screen')).toBeVisible();
  await page.getByTestId('reveal-btn').click();
  await expect(page.getByTestId('reveal-btn')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByTestId('submit-btn')).not.toHaveAttribute('aria-busy');
  await expectNoOverflow(page);
  await page.screenshot({ path: `/tmp/recall-loading-grade-${page.viewportSize()!.width}.png` });
  grading.resolve();
  await expect(page.getByTestId('result')).toBeVisible();
  const good = page.getByTestId('rating-bar').locator('[data-rating="3"]');
  await good.click();
  await expect(good).toHaveAttribute('aria-busy', 'true');
  await expect(good).toContainText('저장 중');
  await expectNoOverflow(page);
  rating.resolve();
  await expect(page.getByTestId('next-btn')).toBeVisible();
});

test('sidebar stays fixed and scrolls independently while showing five recent collections', async ({ page }) => {
  await mockSidebarCollections(page);
  await page.goto('/prompt');
  const sidebar = page.getByTestId('sidebar');
  const mobile = page.viewportSize()!.width < 768;
  if (mobile) await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  await expect(sidebar).toHaveCSS('position', 'fixed');
  await sidebar.getByRole('button', { name: '덱', exact: true }).click();
  await sidebar.getByRole('button', { name: '과목', exact: true }).click();
  for (const kind of ['덱', '과목']) {
    const recent = sidebar.getByRole('list', { name: `최근 복습한 ${kind}` });
    await expect(recent.getByRole('link')).toHaveCount(5);
    for (let i = 0; i < 5; i++) await expect(recent.getByRole('link').nth(i)).toHaveText(new RegExp(`^${kind} ${7 - i}`));
  }
  await expect(sidebar.getByRole('link', { name: '전체 덱 보기', exact: true })).toHaveAttribute('href', '/decks');
  await expect(sidebar.getByRole('link', { name: '전체 과목 보기', exact: true })).toHaveAttribute('href', '/subjects');
  const before = (await sidebar.boundingBox())!;
  expect(before.y).toBe(0);
  expect(before.height).toBe(page.viewportSize()!.height);
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const after = (await sidebar.boundingBox())!;
  expect(after.y).toBe(0);
  expect(after.height).toBe(before.height);
  const mainScroll = await page.evaluate(() => window.scrollY);
  await sidebar.evaluate((element) => { element.scrollTop = 300; });
  await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(mainScroll);
  await expectNoOverflow(page);
  if (!mobile) expect((await page.locator('main').boundingBox())!.x).toBe(240);
  await sidebar.evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: `/tmp/recall-sidebar-${page.viewportSize()!.width}.png` });
});

test('collection submenu toggles and links navigate on desktop and close the mobile drawer', async ({ page }) => {
  const { subjectName } = await mockSidebarCollections(page);
  await page.goto('/prompt');
  const sidebar = page.getByTestId('sidebar');
  const mobile = page.viewportSize()!.width < 768;
  if (mobile) await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  const deckToggle = sidebar.getByRole('button', { name: '덱', exact: true });
  await expect(deckToggle).toHaveAttribute('aria-expanded', 'false');
  await deckToggle.click();
  await expect(deckToggle).toHaveAttribute('aria-expanded', 'true');
  await deckToggle.click();
  await expect(page.locator('#sidebar-decks')).toBeHidden();
  await deckToggle.click();
  await sidebar.getByRole('list', { name: '최근 복습한 덱' }).getByRole('link', { name: '덱 7', exact: true }).click();
  await expect(page).toHaveURL(/\/decks\/deck-7$/);
  await expect(page.getByRole('heading', { name: '덱 7', exact: true })).toBeVisible();
  if (mobile) {
    await expect(page.getByRole('button', { name: '메뉴 열기', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  }
  await sidebar.getByRole('button', { name: '과목', exact: true }).click();
  const subject = sidebar.getByRole('list', { name: '최근 복습한 과목' }).getByRole('link', { name: subjectName, exact: true });
  await expect(subject).toHaveAttribute('href', `/decks?subject=${encodeURIComponent(subjectName)}`);
  await subject.click();
  await expect.poll(() => new URL(page.url()).searchParams.get('subject')).toBe(subjectName);
  if (mobile) {
    await expect(page.getByRole('button', { name: '메뉴 열기', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  }
  await expect(sidebar.getByRole('list', { name: '최근 복습한 과목' }).getByRole('link', { name: subjectName, exact: true })).toHaveAttribute('aria-current', 'page');
  await sidebar.getByRole('link', { name: '전체 과목 보기', exact: true }).click();
  await expect(page).toHaveURL(/\/subjects$/);
  await expect(page.getByRole('heading', { name: '과목', exact: true })).toBeVisible();
  await expectNoOverflow(page);
});

for (const kind of ['decks', 'subjects'] as const) {
  test(`${kind} keep recent review order and support archive tabs and restoration`, async ({ page }) => {
    const progress = { total: 8, new: 7, learning: 1, review: 0, relearning: 0, dueToday: 0, flagged: 0, suspended: 0 };
    const rows = [
      { id: 'recent', title: '최근 복습한 덱', name: '최근 복습한 과목', subject: 'Z 과목', lastReviewedAt: '2026-10-21T10:00:00Z' },
      { id: 'older', title: '이전에 복습한 덱', name: '이전에 복습한 과목', subject: 'A 과목', lastReviewedAt: '2026-10-20T10:00:00Z' },
      { id: 'new', title: '아직 복습하지 않은 덱', name: '아직 복습하지 않은 과목', subject: 'B 과목', lastReviewedAt: null },
    ].map((row) => ({ ...row, slug: row.id, language: 'ko', tags: ['테스트'], description: null, color: '#0f766e', progress, questionCount: 8, deckIds: [row.id], archivedAt: null as string | null }));
    await page.route('**/*', async (route) => {
      if (!['fetch', 'xhr'].includes(route.request().resourceType())) return route.fallback();
      const url = new URL(route.request().url());
      if (url.pathname === `/${kind}`) return route.fulfill({ json: rows.filter((row) => Boolean(row.archivedAt) === (url.searchParams.get('archived') === 'true')) });
      const action = url.pathname.match(new RegExp(`^/${kind}/([^/]+)/(archive|unarchive)$`));
      if (!action) return route.fallback();
      const row = rows.find((row) => row.id === action[1])!;
      row.archivedAt = action[2] === 'archive' ? '2026-10-21T11:00:00Z' : null;
      return route.fulfill({ json: row });
    });
    await page.goto(`/${kind}`);
    const card = page.getByTestId(kind === 'decks' ? 'deck-card' : 'subject-card');
    const idAttribute = kind === 'decks' ? 'data-deck-id' : 'data-subject-id';
    await expect(card).toHaveCount(3);
    expect(await card.evaluateAll((elements, attr) => elements.map((e) => e.getAttribute(attr)), idAttribute)).toEqual(['recent', 'older', 'new']);
    await expectNoOverflow(page);
    await page.evaluate(() => sessionStorage.setItem('rs-study:all:scheduled', 'old-queue'));
    const name = kind === 'decks' ? rows[0].title : rows[0].name;
    await page.getByRole('button', { name: `${name} 아카이브`, exact: true }).click();
    await expect(card).toHaveCount(2);
    expect(await page.evaluate(() => sessionStorage.getItem('rs-study:all:scheduled'))).toBeNull();
    await page.getByRole('tab', { name: '아카이브', exact: true }).click();
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute(idAttribute, 'recent');
    await expectNoOverflow(page);
    await page.screenshot({ path: `/tmp/recall-${kind}-archive-${page.viewportSize()!.width}.png`, fullPage: true });
    await page.getByRole('button', { name: `${name} 아카이브 해제`, exact: true }).click();
    await expect(card).toHaveCount(0);
    await page.getByRole('tab', { name: kind === 'decks' ? '덱' : '과목', exact: true }).click();
    await expect(card).toHaveCount(3);
    await expect(card.first()).toHaveAttribute(idAttribute, 'recent');
    await page.reload();
    await expect(card.first()).toHaveAttribute(idAttribute, 'recent');
    await expectNoOverflow(page);
  });
}

test('integer study settings allow 100,000 and block saving values beyond the hard limit', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('switch', { name: '확장 18종 허용', exact: true })).toBeVisible();
  const fields = ['newCardsPerDay', 'reviewsPerDay', 'dailyReviewGoal', 'leechThreshold', 'maximumInterval'];
  await expect(page.locator('#newCardsPerDay')).toHaveValue('20');
  for (const field of fields) {
    const input = page.locator(`#${field}`);
    await expect(input).toHaveAttribute('max', '100000');
    await input.fill('100000');
  }
  await page.locator('#reviewsPerDay').fill('100001');
  let updates = 0;
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/settings' && request.method() === 'PATCH') updates += 1; });
  await page.getByTestId('save-settings').click();
  expect(await page.locator('#reviewsPerDay').evaluate((element: HTMLInputElement) => element.validity.rangeOverflow)).toBe(true);
  expect(updates).toBe(0);
  await page.locator('#reviewsPerDay').fill('100000');
  const saved = page.waitForRequest((request) => new URL(request.url()).pathname === '/settings' && request.method() === 'PATCH');
  await page.getByTestId('save-settings').click();
  const patch = (await saved).postDataJSON();
  for (const field of fields) expect(patch[field]).toBe(100_000);
  await expect(page.getByText('설정을 저장했습니다', { exact: true })).toBeVisible();
  await page.reload();
  for (const field of fields) await expect(page.locator(`#${field}`)).toHaveValue('100000');
});

test('browser and PWA colors follow the app theme across OS preferences, navigation and reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/import');
  const color = page.locator('meta[name="theme-color"]');
  const scheme = page.locator('meta[name="color-scheme"]');
  await expect(color).toHaveCount(1);
  await expect(color).toHaveAttribute('content', '#f7f8f7');
  await expect(scheme).toHaveAttribute('content', 'light');
  await page.getByTestId('theme-toggle').click();
  await expect(color).toHaveAttribute('content', '#121716');
  await expect(scheme).toHaveAttribute('content', 'dark');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(18, 23, 22)');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 23, 22)');
  await expect(page.locator('header').first()).toHaveCSS('background-color', 'rgb(18, 23, 22)');
  expect(await color.getAttribute('media')).toBeNull();
  await page.getByTestId('copy-prompt-trigger').click();
  await page.getByTestId('copy-prompt-options').click();
  await expect(page).toHaveURL(/\/prompt$/);
  await expect(color).toHaveAttribute('content', '#121716');
  // Simulate head metadata being refreshed after a route transition.
  await page.evaluate(() => document.querySelector('meta[name="theme-color"]')!.setAttribute('content', '#f7f8f7'));
  await expect(color).toHaveAttribute('content', '#121716');
  await page.reload();
  await expect(color).toHaveAttribute('content', '#121716');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(color).toHaveAttribute('content', '#121716');
  await page.getByTestId('theme-toggle').click();
  await expect(color).toHaveAttribute('content', '#f7f8f7');
  await expect(scheme).toHaveAttribute('content', 'light');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(247, 248, 247)');
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.theme_color).toBe('#f7f8f7');
  expect(manifest.background_color).toBe('#f7f8f7');
});

test('prompt auto count, saved defaults, source switching, custom fields and long choices fit', async ({ page }) => {
  await page.goto('/prompt');
  const extended = page.getByRole('switch', { name: '확장 18종 허용', exact: true });
  await expect(extended).toBeChecked();
  await extended.click();
  await expect(page.getByTestId('prompt-config-preview')).toContainText('ALLOW_EXTENDED_TYPES: false');
  const count = page.getByRole('spinbutton', { name: '문항 수', exact: true });
  await expect(count).toHaveAttribute('max', '10000');
  await count.fill('10000');
  await expect(page.getByTestId('prompt-config-preview')).toContainText('NUMBER_OF_QUESTIONS: 10000');
  await count.fill('10001');
  await expect(count).toHaveValue('10000');
  await page.getByTestId('prompt-count-mode').selectOption('auto');
  await expect(page.getByTestId('prompt-config-preview')).toContainText('NUMBER_OF_QUESTIONS: auto');
  await page.getByTestId('prompt-save-defaults').click();
  await expect(page.getByText('프롬프트 기본값을 저장했습니다', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('prompt-count-mode')).toHaveValue('auto');
  await expect(extended).not.toBeChecked();
  await extended.click();
  await expect(page.getByTestId('prompt-config-preview')).toContainText('ALLOW_EXTENDED_TYPES: true');
  await page.getByTestId('prompt-deck-select').selectOption('__custom');
  await page.getByTestId('prompt-deck-custom').fill('mobile_deck');
  await page.getByTestId('prompt-subject-select').selectOption('__custom');
  await page.getByTestId('prompt-subject-custom').fill('과목');
  await expectNoOverflow(page);
  await page.getByRole('radio', { name: '일반 지식 모드', exact: true }).click();
  await expect(page.getByTestId('prompt-count-mode')).toHaveCount(0);
  await expect(page.getByTestId('prompt-config-preview')).toContainText('NUMBER_OF_QUESTIONS: 24');
  await expectNoOverflow(page);
  await page.screenshot({ path: `/tmp/recall-prompt-${page.viewportSize()!.width}.png`, fullPage: true });
});

test('primary import actions are above the input, settings sit alongside on desktop, and one click validates before saving', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/imports/*', async (route) => {
    const operation = new URL(route.request().url()).pathname.split('/').pop()!;
    requests.push(operation);
    return route.fulfill({ json: {
      ok: true, issues: [], items: [], strategy: 'upsert', deactivate: [], deckId: 'imported-deck', deckSlug: batch.deck.id,
      deck: { id: null, slug: batch.deck.id, exists: false, newTitle: batch.deck.title },
      summary: { total: batch.questions.length, byType: {} },
      counts: { created: batch.questions.length, updated: 0, unchanged: 0, resetSchedule: 0, deactivated: 0, skipped: 0 },
    } });
  });
  await page.goto('/import');
  for (const multi of [false, true]) {
    if (multi) await page.getByTestId('tab-multi').click();
    const primary = page.getByTestId(multi ? 'multi-validate-and-commit-btn' : 'validate-and-commit-btn');
    const input = page.getByTestId(multi ? 'multi-dropzone' : 'import-textarea');
    const settings = page.getByTestId(multi ? 'multi-import-settings' : 'import-settings');
    await expect(primary).toBeInViewport();
    const buttonBox = (await primary.boundingBox())!;
    const inputBox = (await input.boundingBox())!;
    const settingsBox = (await settings.boundingBox())!;
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(inputBox.y);
    if (page.viewportSize()!.width >= 1024) {
      expect(settingsBox.x).toBeGreaterThanOrEqual(inputBox.x + inputBox.width);
      expect(settingsBox.y + settingsBox.height).toBeLessThan(page.viewportSize()!.height);
    } else {
      expect(settingsBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height);
    }
    if (multi) {
      await page.getByTestId('multi-file-input').setInputFiles({ name: 'batch.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(batch)) });
    } else {
      await page.getByTestId('load-example').click();
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoOverflow(page);
    await page.screenshot({ path: `/tmp/recall-import-${multi ? 'multi' : 'single'}-actions-${page.viewportSize()!.width}.png` });
    await expect(primary).toBeEnabled();
    await primary.click();
    await expect(page.getByTestId(multi ? 'multi-report' : 'report')).toBeVisible();
    expect(requests).toEqual(multi ? ['validate', 'commit', 'validate', 'commit'] : ['validate', 'commit']);
    await expect(primary).toBeDisabled();
    await page.evaluate(() => window.scrollTo(0, 0));
  }
});

test('single and multi import contain long text, selects and file tables', async ({ page, isMobile }) => {
  await page.goto('/import');
  await page.getByTestId('load-example').click();
  await page.getByRole('combobox', { name: '덮어쓰기 전략' }).filter({ visible: true }).selectOption('replace_deck');
  await page.getByTestId('import-target-deck').selectOption('new');
  await expectNoOverflow(page);
  await expect(page.getByTestId('import-textarea')).toHaveCSS('font-size', isMobile ? '16px' : '13px');
  await page.getByTestId('tab-multi').click();
  await page.getByTestId('multi-file-input').setInputFiles({ name: 'long_filename_for_mobile_layout_testing.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(batch)) });
  await expect(page.getByTestId('multi-row')).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: `/tmp/recall-import-${page.viewportSize()!.width}.png`, fullPage: true });
});

test('typing, answer reveal, grading and next question keep mobile controls reachable', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/study/all?mode=cram');
  await expect(page.getByTestId('study-screen')).toBeVisible();
  for (const q of questions) {
    await expect(page.getByTestId('study-screen')).toHaveAttribute('data-type', q.type);
    await expectActions(page);
    if (isMobile) expect(await page.evaluate(() => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? ''))).toBe(false);
    const field = page.locator('[data-testid="study-screen"] input:not([type="checkbox"]), [data-testid="study-screen"] textarea').first();
    await field.fill('모바일 입력 테스트');
    await expect(field).toBeFocused();
    await expectNoOverflow(page);
    await page.screenshot({ path: `/tmp/recall-answering-${q.type}-${page.viewportSize()!.width}.png` });
    await page.getByTestId(q.type === 'essay' ? 'reveal-btn' : 'submit-btn').click();
    await expect(page.getByTestId('result')).toBeVisible();
    await expectNoOverflow(page);
    await expectActions(page);
    await page.getByTestId('rating-bar').locator('[data-rating="3"]').click();
    await expect(page.getByTestId('next-btn')).toBeVisible();
    await expectActions(page);
    await page.screenshot({ path: `/tmp/recall-study-${q.type}-${page.viewportSize()!.width}.png` });
    await page.getByTestId('next-btn').click();
  }
  await expect(page.getByTestId('session-summary')).toBeVisible();
  expect(errors).toEqual([]);
});

test('browse next stays beside the notice at the mobile right edge and advances every question', async ({ page }) => {
  await page.goto('/study/all?mode=browse');
  const screen = page.getByTestId('study-screen');
  for (const q of questions) {
    await expect(screen).toHaveAttribute('data-question-id', q.id);
    await page.getByTestId('reveal-btn').click();
    const next = page.getByTestId('next-btn');
    const notice = page.getByTestId('study-mode-notice');
    await expect(next).toBeVisible();
    await expect(notice).toContainText('구경 모드');
    await expect(page.getByTestId('rating-bar')).toHaveCount(0);
    await expectActions(page);
    await expectNoOverflow(page);
    const nextBox = (await next.boundingBox())!;
    const noticeBox = (await notice.boundingBox())!;
    if (page.viewportSize()!.width < 768) {
      expect(nextBox.x).toBeGreaterThanOrEqual(noticeBox.x + noticeBox.width);
      expect(nextBox.x + nextBox.width).toBeCloseTo(page.viewportSize()!.width - 12, 0);
      expect(nextBox.y + nextBox.height / 2).toBeCloseTo(noticeBox.y + noticeBox.height / 2, 0);
      expect(nextBox.height).toBeGreaterThanOrEqual(44);
    } else {
      expect(nextBox.x + nextBox.width).toBeLessThanOrEqual(noticeBox.x);
    }
    if (q === questions[0]) await page.screenshot({ path: `/tmp/recall-browse-actions-${page.viewportSize()!.width}.png` });
    await next.click();
  }
  await expect(page.getByTestId('session-summary')).toBeVisible();
});

test('exam navigation and submit use the same mobile action bar', async ({ page }) => {
  await page.goto('/exam/run/ui-test');
  await expect(page.getByTestId('exam-run')).toBeVisible();
  await expectActions(page);
  await expectNoOverflow(page);
});

test('action bar follows keyboard viewport changes and ignores pinch zoom', async ({ page, isMobile }) => {
  test.skip(!isMobile || page.viewportSize()!.width >= 768, 'The mobile action bar uses the visual viewport.');
  await page.addInitScript(() => {
    const viewport = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  });
  await page.goto('/study/all?mode=cram');
  const bar = page.getByTestId('study-actions');
  await expect(bar).toBeVisible();
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 440, offsetTop: 30, scale: 1 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  // Browser chrome/viewport changes without an active field are not a keyboard.
  await expect(bar).toHaveAttribute('data-keyboard', 'false');
  await expect(bar).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  const field = page.locator('[data-study-root] input:not([type="checkbox"]), [data-study-root] textarea').first();
  await field.focus();
  await expect(bar).toHaveAttribute('data-keyboard', 'true');
  await expect(bar).toHaveCSS('bottom', '0px');
  await expect(bar).toHaveCSS('transform', `matrix(1, 0, 0, 1, 0, -${page.viewportSize()!.height - 470})`);
  // Scrolling while typing must not rewrite layout or scroll the field back into view.
  const changes = await page.evaluate(async () => {
    let mutations = 0;
    let scrolls = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    for (const element of [document.querySelector('[data-study-root]')!, document.querySelector('.study-actions')!]) {
      observer.observe(element, { attributes: true, attributeFilter: ['style', 'data-keyboard'] });
    }
    const original = window.scrollBy;
    window.scrollBy = () => { scrolls++; };
    try {
      for (let i = 0; i < 8; i++) {
        window.visualViewport!.dispatchEvent(new Event('scroll'));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return { mutations, scrolls };
    } finally {
      window.scrollBy = original;
      observer.disconnect();
    }
  });
  expect(changes).toEqual({ mutations: 0, scrolls: 0 });
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { scale: 2 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(bar).toHaveCSS('bottom', '0px');
  await expect(bar).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: window.innerHeight, offsetTop: 0, scale: 1 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(bar).toHaveCSS('bottom', '0px');
  await expect(bar).toHaveAttribute('data-keyboard', 'false');
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 440, offsetTop: 30 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(bar).toHaveAttribute('data-keyboard', 'true');
  await field.blur();
  await expect(bar).toHaveAttribute('data-keyboard', 'false');
  await expectActions(page);
});
