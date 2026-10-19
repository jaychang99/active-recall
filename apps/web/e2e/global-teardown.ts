/* The seed helper turns choice shuffling off so key presses map to authored order; put it back for the learner. */
export default async function globalTeardown() {
  const api = process.env.E2E_API_URL ?? 'http://localhost:4000';
  try {
    await fetch(`${api}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shuffleChoices: true, newCardsPerDay: 20 }) });
  } catch {
    // API already down: nothing to restore
  }
}
