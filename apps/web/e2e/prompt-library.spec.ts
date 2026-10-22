import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { API } from './helpers';
import { promptOptionsFixture } from '../../api/test/prompt-fixture';

type Snapshot = { id: string; kind: string; name: string; copyKind?: string; optionsJson: Record<string, unknown>; createdAt: string };

// Browser interactions use an isolated API; database persistence and ownership have API integration coverage.
async function mockPromptApi(page: Page, context: BrowserContext, baseURL: string, snapshots: Snapshot[] = []) {
  await context.addCookies([{ name: 'authjs.session-token', value: 'prompt-library-ui-test', url: baseURL }]);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/token', (route) => route.fulfill({ json: { token: 'ui-test', expiresAt: Date.now() + 3600_000 } }));
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { user: { email: 'ui@test.local', name: 'UI Test' }, expires: '2099-01-01T00:00:00Z' } }));
  let nextId = snapshots.length + 1;
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/settings') return route.fulfill({ json: { shortcutsEnabled: true, promptDefaults: null } });
    if (path.startsWith('/prompt-library')) {
      if (request.method() === 'POST') {
        const input = request.postDataJSON();
        const item = { id: String(nextId++), ...input, optionsJson: input.options, createdAt: new Date().toISOString() };
        snapshots.unshift(item);
        return route.fulfill({ status: 201, json: item });
      }
      if (request.method() === 'DELETE') {
        snapshots.splice(snapshots.findIndex((item) => item.id === path.split('/').pop()), 1);
        return route.fulfill({ json: { deleted: true } });
      }
      if (request.method() === 'PATCH') {
        snapshots.find((item) => item.id === path.split('/').pop())!.name = request.postDataJSON().name;
        return route.fulfill({ json: { updated: true } });
      }
      if (path !== '/prompt-library') {
        const item = snapshots.find((item) => item.id === path.split('/').pop());
        return route.fulfill(item ? { json: item } : { status: 404, json: { message: '저장된 설정을 찾을 수 없습니다' } });
      }
      const items = snapshots.filter((item) => item.kind === url.searchParams.get('kind') && item.name.includes(url.searchParams.get('search') || ''));
      const offset = Number(url.searchParams.get('offset') || 0);
      return route.fulfill({ json: { items: items.slice(offset, offset + 20), nextOffset: offset + 20 < items.length ? offset + 20 : null } });
    }
    if (path === '/shares/received/count') return route.fulfill({ json: { pending: 0 } });
    return route.fulfill({ json: [] });
  });
  return snapshots;
}

test('manages history on a dedicated page and loads full settings into the original editor', async ({ page, context, baseURL }) => {
  const snapshots = await mockPromptApi(page, context, baseURL!);
  await page.goto('/prompt');
  await expect(page.getByTestId('prompt-library')).toHaveCount(0);
  await page.getByRole('radio', { name: '일반 지식 모드' }).click();
  await page.getByTestId('prompt-main-topic').fill('운영체제');
  await page.getByTestId('prompt-subtopics').fill('프로세스\n가상 메모리');
  await page.getByLabel('문항 수', { exact: true }).fill('47');
  await page.getByLabel('출력 언어', { exact: true }).selectOption('__custom');
  await page.getByLabel('언어 코드').fill('fr');
  await page.getByLabel('어려움 비율').fill('70');
  await page.getByTestId('prompt-copy-bundle').click();
  await expect.poll(() => snapshots.length).toBe(1);
  const original = structuredClone(snapshots[0]!.optionsJson);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('ATTACHED SCHEMA');
  expect(clipboard).toMatch(/NUMBER_OF_QUESTIONS:\s*47/);

  await page.getByTestId('prompt-main-topic').fill('다른 주제');
  await page.getByTestId('prompt-history-link').click();
  await expect(page).toHaveURL(/\/prompt\/history$/);
  await expect(page.getByTestId('prompt-snapshot')).toHaveCount(1);
  await page.getByTestId('prompt-snapshot-load').click();
  await expect(page).toHaveURL(/\/prompt\?from=1$/);
  await expect(page.getByTestId('prompt-library')).toHaveCount(0);
  await expect(page.getByTestId('prompt-main-topic')).toHaveValue('운영체제');
  await expect(page.getByTestId('prompt-subtopics')).toHaveValue('프로세스\n가상 메모리');
  await expect(page.getByLabel('문항 수', { exact: true })).toHaveValue('47');
  await expect(page.getByLabel('언어 코드')).toHaveValue('fr');
  await expect(page.getByLabel('어려움 비율')).toHaveValue('70');
  await page.reload();
  await expect(page.getByLabel('언어 코드')).toHaveValue('fr');

  await page.getByTestId('prompt-save-preset').click();
  await page.getByLabel('프리셋 이름', { exact: true }).fill('운영체제 시험');
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(snapshots.filter((item) => item.kind === 'history')).toHaveLength(1);
  expect(snapshots.find((item) => item.kind === 'preset')!.optionsJson).toEqual(original);
  await page.getByTestId('prompt-main-topic').fill('운영체제 심화');
  await page.getByTestId('prompt-copy-prompt').click();
  await expect.poll(() => snapshots.filter((item) => item.kind === 'history').length).toBe(2);
  await expect(page.getByTestId('prompt-main-topic')).toHaveValue('운영체제 심화');
  await page.getByTestId('prompt-history-link').click();
  await expect(page.getByTestId('prompt-snapshot')).toHaveCount(2);
  await page.getByRole('button', { name: '운영체제 심화 삭제' }).click();
  await expect(page.getByTestId('prompt-snapshot')).toHaveCount(1);
  await page.getByRole('button', { name: '프리셋', exact: true }).click();
  await expect(page.getByTestId('prompt-snapshot')).toHaveCount(1);
  await page.getByRole('button', { name: '이름 변경' }).click();
  await page.getByLabel('프리셋 이름', { exact: true }).fill('시험 최종');
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByTestId('prompt-snapshot')).toContainText('시험 최종');
  await page.getByTestId('prompt-snapshot-load').click();
  await expect(page.getByLabel('언어 코드')).toHaveValue('fr');

  const beforeSchemaCopy = snapshots.length;
  await page.getByTestId('copy-prompt-trigger').click();
  await page.getByRole('menuitem', { name: 'JSON 스키마만' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('"$schema"');
  expect(snapshots).toHaveLength(beforeSchemaCopy);
  await page.getByTestId('copy-prompt-trigger').click();
  await page.getByTestId('copy-prompt-bundle').click();
  await expect.poll(() => snapshots.length).toBe(beforeSchemaCopy + 1);
  expect(snapshots[0]!.optionsJson.outputLanguage).toBe('auto');
});

test('scrolls the whole history list and keeps the editor right column reachable in short windows', async ({ page, context, baseURL }) => {
  const snapshots = Array.from({ length: 45 }, (_, i) => ({ id: String(i + 1), kind: 'history', copyKind: 'bundle', name: `이력 ${String(i + 1).padStart(3, '0')}`, optionsJson: promptOptionsFixture, createdAt: '2026-10-22T00:00:00Z' }));
  await mockPromptApi(page, context, baseURL!, snapshots);
  await page.goto('/prompt/history');
  await expect(page.getByTestId('prompt-snapshot')).toHaveCount(20);
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await expect(page.getByTestId('prompt-snapshot')).toHaveCount(40);
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await expect(page.getByTestId('prompt-snapshot')).toHaveCount(45);
  await page.getByTestId('prompt-snapshot').last().scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  expect(await page.getByRole('list', { name: '복사 이력 목록' }).evaluate((el) => getComputedStyle(el).overflowY)).toBe('visible');
  await page.getByRole('textbox', { name: '이력·프리셋 이름 검색' }).fill('이력 045');
  await expect(page.getByTestId('prompt-snapshot')).toHaveCount(1);
  await page.getByRole('heading', { name: '프롬프트 복사 이력·프리셋' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/prompt-history-${test.info().project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const width = page.viewportSize()!.width;
  await page.setViewportSize({ width, height: 600 });
  await page.goto('/prompt');
  await expect(page.getByTestId('prompt-copy-bundle')).toBeEnabled();
  const actions = page.getByTestId('prompt-actions');
  expect(await actions.evaluate((el) => getComputedStyle(el).position)).toBe('static');
  await actions.scrollIntoViewIfNeeded();
  const box = await actions.boundingBox();
  await page.mouse.move(box!.x + box!.width - 12, Math.max(80, box!.y + 20));
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  await page.getByTestId('prompt-save-defaults').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('prompt-save-defaults')).toBeInViewport();
  await page.goto('/prompt?from=missing');
  await expect(page.getByRole('alert').filter({ hasText: '설정을 불러오지 못했습니다' })).toBeVisible();
  await expect(page.getByTestId('prompt-copy-bundle')).toBeDisabled();
});
