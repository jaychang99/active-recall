import { expect, test } from '@playwright/test';
import { API, exampleBatch, seedDeck } from './helpers';

test.describe('app surfaces', () => {
  test.beforeEach(async ({ request }) => { await seedDeck(request); });

  test('theme toggle switches dark/light and persists', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveClass(/light/);
    await page.getByTestId('theme-toggle').click();
    await expect(html).toHaveClass(/dark/);
    await page.reload();
    await expect(html).toHaveClass(/dark/);
    await page.getByTestId('theme-toggle').click();
    await expect(html).toHaveClass(/light/);
  });

  test('copy LLM prompt + schema from the header on any page', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/insights');
    await page.getByTestId('copy-prompt-trigger').click();
    await page.getByTestId('copy-prompt-bundle').click();
    await expect(page.getByText('프롬프트 + 스키마 복사됨')).toBeVisible();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('NON-NEGOTIABLE OUTPUT CONTRACT');
    expect(text).toContain('"$schema": "https://json-schema.org/draft/2020-12/schema"');
  });

  test('import: validates, shows semantic errors with pointers, commits, and is idempotent', async ({ page }) => {
    await page.goto('/import');
    const bad = exampleBatch();
    (bad.questions[0] as { answer: { choiceId: string } }).answer.choiceId = 'zzz';
    await page.getByTestId('import-textarea').fill(JSON.stringify(bad));
    await page.getByTestId('validate-btn').click();
    await expect(page.getByTestId('issues')).toContainText('문항 #1 (net-q001)');
    await expect(page.getByTestId('issues')).toContainText('not one of the choices');
    await expect(page.getByTestId('commit-btn')).toBeDisabled();
    await page.getByTestId('load-example').click();
    await page.getByTestId('validate-btn').click();
    await expect(page.getByTestId('plan')).toContainText('검증 통과');
    await expect(page.getByTestId('plan')).toContainText('0 / 0 / 8'); // already seeded → unchanged
    await page.getByTestId('commit-btn').click();
    await expect(page.getByTestId('report')).toContainText('동일 8');
  });

  test('deck detail: answer-key review mode and question drawer', async ({ page }) => {
    await page.goto('/decks/computer_networks_01');
    await expect(page.getByTestId('question-table')).toBeVisible();
    await expect(page.getByTestId('question-table')).not.toContainText('인정 답안');
    await page.getByTestId('toggle-answers').click();
    await expect(page.getByTestId('question-table')).toContainText('인정 답안: 32');
    await page.getByRole('button', { name: /net-q008/ }).click();
    await expect(page.getByRole('dialog')).toContainText('DNS ↔ 도메인 이름 해석');
  });

  test('exam: grades, excludes essay from objective accuracy, never touches FSRS', async ({ page, request }) => {
    await page.goto('/exam?deckId=computer_networks_01');
    await page.getByRole('checkbox', { name: '문항 순서 섞기' }).uncheck();
    await page.getByTestId('start-exam').click();
    await expect(page.getByTestId('exam-run')).toBeVisible();
    await page.keyboard.press('1');
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('submit-exam').click();
    await expect(page.getByTestId('exam-score')).toBeVisible();
    await expect(page.getByTestId('exam-score')).toContainText('/ 7 (서술형 제외)');
    const cards = await (await request.get(`${API}/study/queue?deckId=computer_networks_01&mode=cram&limit=100`)).json();
    expect(cards.items.every((i: { card: { reps: number } }) => i.card.reps === 0)).toBe(true);
  });

  test('command palette and shortcut help open with keys; Esc closes', async ({ page }) => {
    await page.goto('/decks');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    await expect(page.getByTestId('palette-list')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('palette-list')).toBeHidden();
    await page.keyboard.press('Shift+?');
    await expect(page.getByRole('dialog', { name: '키보드 단축키' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('insights and settings render with honest denominators', async ({ page }) => {
    await page.goto('/insights');
    await expect(page.getByTestId('insights')).toContainText('자동채점');
    await expect(page.getByTestId('insights')).toContainText('FSRS 추정');
    await page.goto('/settings');
    await page.getByLabel('하루 새 카드 상한').fill('25');
    await page.getByTestId('save-settings').click();
    await expect(page.getByText('설정을 저장했습니다')).toBeVisible();
  });

  test('mobile: study screen has no horizontal overflow', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('mobile'), 'mobile project only');
    await page.goto('/study/computer_networks_01?mode=cram');
    await expect(page.getByTestId('study-screen')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
