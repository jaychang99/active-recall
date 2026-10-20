import { expect, test } from './fixtures';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator } from '@playwright/test';
import { API, importBatch } from './helpers';

const batch = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'examples', 'example-extended2-batch.json'), 'utf8')) as { deck: { id: string }; questions: { id: string }[] };

/** Click at a normalized (0..1) position inside an element's box. */
async function clickAt(el: Locator, nx: number, ny: number) {
  const box = await el.boundingBox();
  if (!box) throw new Error('no box');
  await el.click({ position: { x: box.width * nx, y: box.height * ny } });
}

// coordinate-point.tsx geometry (viewBox 400×400, padding 28)
const plane = (v: number, min: number, max: number) => (28 + ((v - min) / (max - min)) * (400 - 56)) / 400;

test.describe('extended question types, set 2', () => {
  let deckId = '';
  test.beforeEach(async ({ api }) => {
    deckId = await importBatch(api, batch);
    await api.patch(`${API}/settings`, { data: { shuffleChoices: false, autoAdvanceAfterRating: true } });
  });

  test('all 10 set-2 types can be answered correctly in study mode', async ({ page }) => {
    await page.goto(`/study/${deckId}?mode=cram`);
    const screen = page.getByTestId('study-screen');
    await expect(screen).toBeVisible();
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      await expect(screen).toHaveAttribute('data-phase', 'answering');
      const type = (await screen.getAttribute('data-type')) ?? '';
      seen.add(type);
      switch (type) {
        case 'cloze_bank':
          await page.getByLabel('빈칸 1').selectOption('k200');
          await page.getByLabel('빈칸 2').selectOption('k404');
          await page.getByLabel('빈칸 3').selectOption('k500');
          await page.getByTestId('submit-btn').click();
          break;
        case 'code_cloze':
          await page.getByLabel('빈칸 1').fill('**');
          await page.getByLabel('빈칸 2').fill('range');
          await page.getByLabel('빈칸 3').fill('0');
          await page.keyboard.press('Enter');
          break;
        case 'matrix':
          for (const cell of ['merge:stable', 'merge:nlogn', 'quick:inplace', 'quick:nlogn', 'insertion:stable', 'insertion:inplace', 'heap:inplace', 'heap:nlogn']) await page.locator(`[data-cell="${cell}"]`).check({ force: true });
          await page.getByTestId('submit-btn').click();
          break;
        case 'numeric_grid':
          await page.getByLabel('1행 1열').fill('2');
          await page.getByLabel('1행 2열').fill('1');
          await page.getByLabel('2행 1열').fill('4');
          await page.getByLabel('2행 2열').fill('3');
          await page.keyboard.press('Enter');
          break;
        case 'list_answer':
          await page.getByLabel('답 1').fill('Durability');
          await page.getByLabel('답 2').fill('일관성');
          await page.getByLabel('답 3').fill('isolation');
          await page.getByLabel('답 4').fill('Atomicity');
          await page.keyboard.press('Enter');
          break;
        case 'image_hotspot':
          await expect(page.getByTestId('hotspot-image').locator('svg')).toBeVisible();
          await clickAt(page.getByTestId('hotspot-image'), 0.5, 0.5); // transport layer
          await expect(page.getByTestId('hotspot-marker')).toHaveCount(1);
          await page.getByTestId('submit-btn').click();
          break;
        case 'parsons': {
          for (const id of ['def', 'init', 'loop', 'mul', 'ret']) await page.locator(`button[data-block-id="${id}"]`).click();
          for (const [id, indent] of [['init', 1], ['loop', 1], ['mul', 2], ['ret', 1]] as const) {
            const btn = page.locator(`button[data-line-id="${id}"]`);
            for (let k = 0; k < indent; k++) { await btn.focus(); await page.keyboard.press('ArrowRight'); }
          }
          await page.getByTestId('submit-btn').click();
          break;
        }
        case 'find_and_fix':
          await page.locator('[data-segment-id="s2"]').click();
          await page.getByLabel('FORM 고친 값').fill('FROM');
          await page.locator('[data-segment-id="s5"]').click();
          await page.getByLabel('ORDER name ASC; 고친 값').fill('ORDER BY name ASC;');
          await page.keyboard.press('Enter');
          break;
        case 'coordinate_point': {
          const svg = page.getByTestId('coordinate-plane');
          await clickAt(svg, plane(2, -5, 5), 1 - plane(3, -5, 5));
          await clickAt(svg, plane(0, -5, 5), 1 - plane(-1, -5, 5));
          await expect(page.getByTestId('plane-point')).toHaveCount(2);
          await page.getByTestId('submit-btn').click();
          break;
        }
        case 'regex_answer':
          await page.getByLabel('정규식').fill('\\d{4}-\\d{2}-\\d{2}');
          await page.keyboard.press('Enter');
          break;
        default:
          throw new Error(`unexpected type ${type}`);
      }
      await expect(screen).toHaveAttribute('data-phase', 'submitted');
      const verdict = await page.getByTestId('verdict').getAttribute('data-verdict');
      expect(verdict, `type ${type}`).toBe('correct');
      await page.locator('[data-rating="3"]').click();
    }
    expect(seen.size).toBe(10);
    await expect(page.getByTestId('session-summary')).toBeVisible();
  });

  test('a wrong answer shows per-part feedback and the revealed key', async ({ page }) => {
    await page.goto(`/study/${deckId}?mode=cram`);
    const screen = page.getByTestId('study-screen');
    for (let i = 0; i < 10; i++) {
      await expect(screen).toHaveAttribute('data-phase', 'answering');
      const type = await screen.getAttribute('data-type');
      if (type === 'regex_answer') {
        await page.getByLabel('정규식').fill('\\d+-\\d+-\\d+'); // too loose: matches 2024-1-31
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('verdict')).toHaveAttribute('data-verdict', 'incorrect');
        await expect(page.getByTestId('regex-answer')).toContainText('모범 패턴');
        return;
      }
      await page.getByTestId('reveal-btn').click();
      await expect(screen).toHaveAttribute('data-phase', 'submitted');
      await page.locator('[data-rating="3"]').click();
    }
  });
});
