import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { STORAGE_STATE } from './auth';
import { API, gotoStudy, seedDeck } from './helpers';

/** Reveal and rate the card on screen (Esc first: text answers are auto-focused). */
async function rate(page: Page, key: '1' | '2' | '3' | '4') {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('study-screen')).toHaveAttribute('data-phase', 'submitted');
  await page.keyboard.press(key);
}

test.describe('shared study sessions', () => {
  let deckId = '';
  test.beforeEach(async ({ api }) => {
    ({ deckId } = await seedDeck(api));
    await api.patch(`${API}/settings`, { data: { autoAdvanceAfterRating: true } });
  });

  test('the position survives a reload and a second device joins at the same card, seeing ratings made on the first', async ({ page, browser }) => {
    await gotoStudy(page, deckId, 'scheduled');
    const jump = page.getByTestId('nav-jump');
    await rate(page, '3');
    await expect(jump).toHaveAttribute('placeholder', '2');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await expect(jump).toHaveAttribute('placeholder', '4');
    const saved = page.waitForResponse((r) => r.url().includes('/position') && r.request().method() === 'PATCH');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowLeft');
    await expect(jump).toHaveAttribute('placeholder', '3');
    await saved;

    await page.reload();
    await expect(jump).toHaveAttribute('placeholder', '3');
    await expect(page.getByTestId('session-chip')).toContainText('이어서 학습 중');

    // Another device: same account, nothing on the device yet → joins at the session's last card.
    const other = await browser.newContext({ storageState: STORAGE_STATE });
    const b = await other.newPage();
    try {
      await gotoStudy(b, deckId, 'scheduled');
      await expect(b.getByTestId('nav-jump')).toHaveAttribute('placeholder', '3');
      await expect(b.getByTestId('study-nav-track').locator('[data-status]').first()).toHaveAttribute('data-status', 'rated');

      // The first device rates card 3; the second (on card 3) shows that rating once it syncs (focus).
      await rate(page, '2');
      await expect(jump).toHaveAttribute('placeholder', '4');
      await b.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(b.getByTestId('study-screen')).toHaveAttribute('data-phase', 'rated');
      await expect(b.getByTestId('remote-rated')).toContainText('다른 기기에서');
      await expect(b.getByTestId('remote-rated')).toContainText('어려움');

      // Re-rating on the second device replaces it; the first device sees the new rating on that card.
      await b.getByTestId('undo-btn').click();
      await expect(b.getByTestId('study-screen')).toHaveAttribute('data-phase', 'submitted');
      await b.keyboard.press('4');
      await expect(b.getByTestId('nav-jump')).toHaveAttribute('placeholder', '4');
      await page.keyboard.press('Escape');
      await page.keyboard.press('ArrowLeft');
      await expect(jump).toHaveAttribute('placeholder', '3');
      await expect(page.getByTestId('remote-rated')).toContainText('쉬움');
    } finally {
      await other.close();
    }
  });

  test('새 세션 ends the shared session and starts over at the first card', async ({ page }) => {
    await gotoStudy(page, deckId, 'cram');
    const jump = page.getByTestId('nav-jump');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await expect(jump).toHaveAttribute('placeholder', '2');
    await page.getByTestId('new-session-btn').click();
    await page.getByTestId('confirm-new-session').click();
    await expect(jump).toHaveAttribute('placeholder', '1');
    await expect(page.getByTestId('session-chip')).not.toContainText('이어서');
    await page.reload();
    await expect(jump).toHaveAttribute('placeholder', '1');
  });
});
