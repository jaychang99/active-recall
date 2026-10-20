import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const API = process.env.E2E_API_URL ?? 'http://localhost:4000';

export function exampleBatch() {
  return JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'examples', 'example-question-batch.json'), 'utf8')) as { deck: { id: string; title: string }; questions: { id: string }[] };
}

/** Hard-delete the user's deck with this slug (if any) so the next import starts from round 1. */
export async function deleteDeckBySlug(api: APIRequestContext, slug: string) {
  const decks = (await (await api.get(`${API}/decks?includeDeleted=true`)).json()) as { id: string; slug: string }[];
  for (const d of decks.filter((x) => x.slug === slug)) await api.delete(`${API}/decks/${d.id}?permanent=true`);
}

/** Import a batch as the e2e user and return the internal deck id. */
export async function importBatch(api: APIRequestContext, batch: { deck: { id: string } }, strategy = 'upsert') {
  await deleteDeckBySlug(api, batch.deck.id);
  const res = await api.post(`${API}/imports/commit`, { data: { batch, strategy } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).deckId as string;
}

/** Reset the sample deck to a clean state via the API: re-import and reset every card. */
export async function seedDeck(api: APIRequestContext) {
  const batch = exampleBatch();
  const deckId = await importBatch(api, batch);
  const qs = await api.get(`${API}/decks/${deckId}/questions?pageSize=200`);
  const items = (await qs.json()).items as { id: string }[];
  await api.patch(`${API}/settings`, { data: { newCardsPerDay: 20, reviewsPerDay: 200, shortcutsEnabled: true, autoAdvanceAfterRating: true, shuffleChoices: false, showIntervalPreview: true } });
  return { batch, items, deckId };
}

export async function gotoStudy(page: Page, deckId: string, mode = 'cram') {
  await page.goto(`/study/${deckId}?mode=${mode}`);
  await expect(page.getByTestId('study-screen')).toBeVisible();
}
