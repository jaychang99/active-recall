import { expect, test } from './fixtures';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importBatch, seedDeck } from './helpers';

test.describe('data manager & LaTeX', () => {
  test.beforeEach(async ({ api }) => { await seedDeck(api); });

  test('data manager: filter, sort, paging, select, bulk patch, edit, soft delete + restore', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), 'wide admin table is a desktop surface');
    await page.goto('/data');
    await expect(page.getByText('카드 상태 (FSRS)')).toBeVisible();
    await page.goto('/data/questions');
    const table = page.getByTestId('data-table');
    await expect(table).toBeVisible();
    // scope to the sample deck (other decks may exist in the local DB)
    await page.getByTestId('search').fill('net-q');
    await expect(table.locator('tbody tr')).toHaveCount(8);
    // filter by type
    await page.getByRole('button', { name: /필터/ }).click();
    await page.getByTestId('filters').getByLabel('유형').selectOption('cloze');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: /필터 초기화/ }).click();
    await expect(table.locator('tbody tr')).toHaveCount(8);
    // search + sort
    await page.getByTestId('search').fill('net-q008');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await page.getByTestId('search').fill('net-q');
    await page.getByRole('columnheader', { name: /문항 ID/ }).click();
    await expect(table.locator('tbody tr').first()).toContainText('net-q001');
    // paging
    await page.getByLabel('페이지 크기').selectOption('25');
    await expect(page.getByText(/8건 중 1–8/)).toBeVisible();
    // select two rows → bulk delete → deleted filter → restore
    const boxes = table.locator('tbody input[type=checkbox]');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await expect(page.getByTestId('bulk-bar')).toContainText('2개 선택');
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('bulk-delete').click();
    await expect(table.locator('tbody tr')).toHaveCount(6);
    await page.getByLabel('삭제 상태').selectOption('deleted');
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await table.locator('tbody input[type=checkbox]').nth(0).check();
    await table.locator('tbody input[type=checkbox]').nth(1).check();
    await page.getByRole('button', { name: '복구' }).click();
    await page.getByLabel('삭제 상태').selectOption('live');
    await expect(table.locator('tbody tr')).toHaveCount(8);
    // edit a card via dialog (bulk patch flagged on cards)
    await page.goto('/data/cards');
    await page.getByTestId('data-table').locator('tbody input[type=checkbox]').nth(0).check();
    await page.getByRole('button', { name: '필드 일괄 변경' }).click();
    await page.getByLabel('필드', { exact: true }).selectOption('flagged');
    await page.getByRole('dialog').getByLabel('표시', { exact: true }).check();
    await page.getByRole('button', { name: '적용' }).click();
    await expect(page.getByText(/patch: 1건 성공/)).toBeVisible();
  });

  test('question payload edited through the data manager is validated; LaTeX renders everywhere', async ({ page, api }) => {
    const latex = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'examples', 'example-latex-batch.json'), 'utf8')) as { deck: { id: string } };
    const latexId = await importBatch(api, latex);
    await page.goto(`/study/${latexId}?mode=cram`);
    const screen = page.getByTestId('study-screen');
    await expect(screen).toBeVisible();
    // KaTeX output present in prompt / choices / items for every card
    for (let i = 0; i < 6; i++) {
      await expect(screen).toHaveAttribute('data-phase', 'answering');
      await expect(screen.locator('.katex').first()).toBeVisible();
      await page.getByTestId('reveal-btn').click();
      await expect(screen).toHaveAttribute('data-phase', 'submitted');
      await expect(page.getByTestId('explanation').locator('.katex').first()).toBeVisible();
      await page.locator('[data-rating="3"]').click();
      if (i < 5) await expect(screen).toHaveAttribute('data-phase', 'answering');
    }
    // deck table + drawer render LaTeX too
    await page.goto(`/decks/${latexId}`);
    await expect(page.getByTestId('question-table').locator('.katex').first()).toBeVisible();
    // data manager rejects an invalid payload edit
    await page.goto('/data/questions');
    await page.getByTestId('search').fill('calc-q001');
    await expect(page.getByTestId('data-table').locator('tbody tr')).toHaveCount(1);
    await expect(page.getByTestId('data-table').locator('tbody tr').first()).toContainText('calc-q001');
    await page.getByTestId('data-table').locator('tbody tr').first().getByRole('button', { name: '열기' }).click();
    const form = page.getByTestId('record-form');
    const ta = form.getByLabel('문항 JSON (스키마 검증됨)');
    const payload = JSON.parse(await ta.inputValue()) as { answer: { choiceId: string } };
    payload.answer.choiceId = 'nope';
    await ta.fill(JSON.stringify(payload));
    await page.getByTestId('save-record').click();
    await expect(page.getByText(/semantic validation/)).toBeVisible();
  });
});
