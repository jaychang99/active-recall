import { expect, test } from '@playwright/test';
import { API } from './helpers';

// Browser interactions use an isolated in-memory API; database persistence and ownership have API integration coverage.
test('copies full settings into history, restores and edits them, and keeps named presets independently', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'authjs.session-token', value: 'prompt-library-ui-test', url: baseURL! }]);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/token', (route) => route.fulfill({ json: { token: 'ui-test', expiresAt: Date.now() + 3600_000 } }));
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { user: { email: 'ui@test.local', name: 'UI Test' }, expires: '2099-01-01T00:00:00Z' } }));
  type Snapshot = { id: string; kind: string; name: string; copyKind?: string; optionsJson: Record<string, unknown>; createdAt: string };
  const snapshots: Snapshot[] = [];
  let nextId = 1;
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
      return route.fulfill({ json: { items: snapshots.filter((item) => item.kind === url.searchParams.get('kind') && item.name.includes(url.searchParams.get('search') || '')), nextOffset: null } });
    }
    if (path === '/shares/received/count') return route.fulfill({ json: { pending: 0 } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/prompt');
  await page.getByRole('radio', { name: '일반 지식 모드' }).click();
  await page.getByTestId('prompt-main-topic').fill('운영체제');
  await page.getByTestId('prompt-subtopics').fill('프로세스\n가상 메모리');
  await page.getByLabel('문항 수', { exact: true }).fill('47');
  await page.getByLabel('출력 언어', { exact: true }).selectOption('__custom');
  await page.getByLabel('언어 코드').fill('fr');
  await page.getByLabel('어려움 비율').fill('70');
  await page.getByTestId('prompt-copy-bundle').click();
  await expect(page.getByTestId('prompt-snapshot')).toHaveCount(1);
  expect(snapshots[0]!.optionsJson).toMatchObject({ mainTopic: '운영체제', numberOfQuestions: 47, outputLanguage: 'fr', difficulty: { hard: 70 } });
  const original = structuredClone(snapshots[0]!.optionsJson);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('ATTACHED SCHEMA');
  expect(clipboard).toMatch(/NUMBER_OF_QUESTIONS:\s*47/);

  await page.getByTestId('prompt-main-topic').fill('다른 주제');
  await page.getByLabel('문항 수', { exact: true }).fill('12');
  await page.getByLabel('출력 언어', { exact: true }).selectOption('ko');
  await page.getByTestId('prompt-snapshot-load').click();
  await expect(page.getByTestId('prompt-main-topic')).toHaveValue('운영체제');
  await expect(page.getByTestId('prompt-subtopics')).toHaveValue('프로세스\n가상 메모리');
  await expect(page.getByLabel('문항 수', { exact: true })).toHaveValue('47');
  await expect(page.getByLabel('언어 코드')).toHaveValue('fr');
  await expect(page.getByLabel('어려움 비율')).toHaveValue('70');

  await page.getByTestId('prompt-save-preset').click();
  await page.getByLabel('프리셋 이름', { exact: true }).fill('운영체제 시험');
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(snapshots.filter((item) => item.kind === 'history')).toHaveLength(1);
  expect(snapshots.find((item) => item.kind === 'preset')!.optionsJson).toEqual(original);

  await page.getByTestId('prompt-main-topic').fill('운영체제 심화');
  await page.getByTestId('prompt-copy-prompt').click();
  await expect(page.getByTestId('prompt-snapshot')).toHaveCount(2);
  expect(snapshots.find((item) => item.kind === 'preset')!.optionsJson).toEqual(original);
  await page.reload();
  await expect(page.getByTestId('prompt-snapshot')).toHaveCount(2);
  await page.getByRole('button', { name: '운영체제 심화 삭제' }).click();
  await expect(page.getByTestId('prompt-snapshot')).toHaveCount(1);
  await page.getByRole('button', { name: '프리셋', exact: true }).click();
  await expect(page.getByTestId('prompt-snapshot')).toHaveCount(1);
  await page.getByTestId('prompt-snapshot-load').click();
  await expect(page.getByLabel('언어 코드')).toHaveValue('fr');
  await page.getByRole('button', { name: '이름 변경' }).click();
  await page.getByLabel('프리셋 이름', { exact: true }).fill('시험 최종');
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByTestId('prompt-snapshot')).toContainText('시험 최종');
  await page.getByTestId('prompt-library').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId('prompt-library').screenshot({ path: `/tmp/prompt-library-${test.info().project.name}.png` });
  const beforeSchemaCopy = snapshots.length;
  await page.getByTestId('copy-prompt-trigger').click();
  await page.getByRole('menuitem', { name: 'JSON 스키마만' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('"$schema"');
  expect(snapshots).toHaveLength(beforeSchemaCopy);
  await page.getByTestId('copy-prompt-trigger').click();
  await page.getByTestId('copy-prompt-bundle').click();
  await expect.poll(() => snapshots.length).toBe(beforeSchemaCopy + 1);
  expect(snapshots[0]!.optionsJson.outputLanguage).toBe('auto');
  expect(snapshots[0]!.copyKind).toBe('bundle');
});
