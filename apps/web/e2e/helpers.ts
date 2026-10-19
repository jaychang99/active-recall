import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const API = process.env.E2E_API_URL ?? 'http://localhost:4000';

export function exampleBatch() {
  return JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'examples', 'example-question-batch.json'), 'utf8')) as { deck: { id: string; title: string }; questions: { id: string }[] };
}

/** Reset the sample deck to a clean state via the API: re-import and reset every card. */
export async function seedDeck(request: APIRequestContext) {
  const batch = exampleBatch();
  // Hard-delete the sample deck (with all history) and re-import it so every test starts from round 1.
  await request.delete(`${API}/decks/${batch.deck.id}?permanent=true`);
  const res = await request.post(`${API}/imports/commit`, { data: { batch, strategy: 'upsert' } });
  expect(res.ok()).toBeTruthy();
  const qs = await request.get(`${API}/decks/${batch.deck.id}/questions?pageSize=200`);
  const items = (await qs.json()).items as { id: string }[];
  await request.patch(`${API}/settings`, { data: { newCardsPerDay: 20, reviewsPerDay: 200, shortcutsEnabled: true, autoAdvanceAfterRating: true, shuffleChoices: false, showIntervalPreview: true } });
  return { batch, items };
}

export async function gotoStudy(page: Page, deckId: string, mode = 'cram') {
  await page.goto(`/study/${deckId}?mode=${mode}`);
  await expect(page.getByTestId('study-screen')).toBeVisible();
}
