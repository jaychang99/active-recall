import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { API } from './helpers';

const batch = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'examples', 'example-extended-batch.json'), 'utf8')) as { deck: { id: string }; questions: { id: string }[] };

test.describe('extended question types', () => {
  test.beforeEach(async ({ request }) => {
    await request.delete(`${API}/decks/${batch.deck.id}?permanent=true`);
    const res = await request.post(`${API}/imports/commit`, { data: { batch } });
    expect(res.ok()).toBeTruthy();
    await request.patch(`${API}/settings`, { data: { shuffleChoices: false, autoAdvanceAfterRating: true } });
  });

  test('all 8 extended types can be answered correctly in study mode', async ({ page }) => {
    await page.goto(`/study/${batch.deck.id}?mode=cram`);
    const screen = page.getByTestId('study-screen');
    await expect(screen).toBeVisible();
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      await expect(screen).toHaveAttribute('data-phase', 'answering');
      const type = (await screen.getAttribute('data-type')) ?? '';
      seen.add(type);
      switch (type) {
        case 'numeric':
          await page.getByLabel('숫자 답안').fill('1048576');
          await page.keyboard.press('Enter');
          break;
        case 'cloze_select':
          await page.getByLabel('빈칸 1').selectOption('a');
          await page.getByLabel('빈칸 2').selectOption('b');
          await page.getByTestId('submit-btn').click();
          // the explanation carries a Mermaid state diagram
          await expect(page.getByTestId('explanation').getByTestId('mermaid-block').locator('svg')).toBeVisible({ timeout: 15_000 });
          break;
        case 'statement_set': {
          const rows = page.getByTestId('statement-list').locator('li');
          const want: Record<string, string> = { '상호 배제는': 'O', '순환 대기가 없어도': 'X', '전순서를': 'O', '은행원': 'X' };
          const n = await rows.count();
          for (let r = 0; r < n; r++) {
            const text = await rows.nth(r).innerText();
            const key = Object.keys(want).find((k) => text.includes(k))!;
            await rows.nth(r).getByRole('radio', { name: want[key]! }).click();
          }
          await page.getByTestId('submit-btn').click();
          break;
        }
        case 'categorize': {
          await expect(page.getByTestId('svg-block').locator('svg')).toBeVisible();
          const map: Record<string, string> = { 'Round Robin': 'pre', SRTF: 'pre', '다단계 피드백 큐': 'pre', FCFS: 'non', 'SJF (비선점)': 'non' };
          for (const [t, c] of Object.entries(map)) await page.getByLabel(`${t} 분류`).selectOption(c);
          await page.getByTestId('submit-btn').click();
          break;
        }
        case 'two_tier':
          await page.keyboard.press('1'); // answer a
          await page.keyboard.press('1'); // reason r1
          await page.keyboard.press('Enter');
          break;
        case 'recall_card':
          await page.getByTestId('reveal-btn').click(); // textarea is focused, so Space would type; the button reveals the back
          await expect(page.getByTestId('card-back')).toBeVisible();
          await page.getByTestId('self-check').getByRole('radio', { name: /맞음/ }).click();
          break;
        case 'stepwise':
          await page.getByLabel('1단계 답').fill('7');
          await page.keyboard.press('Enter');
          await page.getByLabel('2단계 답').fill('10');
          await page.keyboard.press('Enter');
          await page.getByLabel('3단계 답').fill('5.67');
          await page.keyboard.press('Enter');
          break;
        case 'highlight':
          await page.locator('[data-segment-id="w5"]').click();
          await page.locator('[data-segment-id="w9"]').click();
          await page.getByTestId('submit-btn').click();
          break;
        default:
          throw new Error(`unexpected type ${type}`);
      }
      await expect(screen).toHaveAttribute('data-phase', 'submitted');
      const verdict = await page.getByTestId('verdict').getAttribute('data-verdict');
      expect(verdict, `type ${type}`).toBe(type === 'recall_card' ? 'revealed' : 'correct');
      await page.locator('[data-rating="3"]').click();
    }
    expect(seen.size).toBe(8);
    await expect(page.getByTestId('session-summary')).toBeVisible();
  });

  test('wrong answers show per-part feedback and never count as correct', async ({ page, request }) => {
    await page.goto(`/study/${batch.deck.id}?mode=cram`);
    const screen = page.getByTestId('study-screen');
    for (let i = 0; i < 8; i++) {
      await expect(screen).toHaveAttribute('data-phase', 'answering');
      const type = await screen.getAttribute('data-type');
      if (type === 'two_tier') {
        await page.keyboard.press('1');
        await page.keyboard.press('2'); // right answer, wrong reason
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('verdict')).toHaveAttribute('data-verdict', 'incorrect');
        await expect(page.getByTestId('verdict')).toContainText('50%');
        return;
      }
      await page.getByTestId('reveal-btn').click();
      await expect(screen).toHaveAttribute('data-phase', 'submitted');
      await page.locator('[data-rating="3"]').click();
    }
    const q = await (await request.get(`${API}/study/queue?deckId=${batch.deck.id}&mode=cram`)).json();
    expect(q.counts.total).toBe(8);
  });
});
