import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toPublicQuestion, type Question } from '@recall/contracts';
import type { Overview } from '../lib/api';

const batch = JSON.parse(readFileSync(join(__dirname, '../../../examples/example-question-batch.json'), 'utf8'));
const questions = (batch.questions as Question[]).filter((q) => q.type === 'single_choice' || q.type === 'short_answer');
const overview: Overview = {
  generatedAt: '2026-10-22T03:00:00Z', timezone: 'Asia/Seoul', windowDays: 30, filter: { deckId: null, subject: null },
  today: { reviewed: 2, uniqueCards: 2, newIntroduced: 0, due: 0, overdue: 0, goal: 50, accuracy: 0, gradable: 2, minutes: 1 },
  window: { reviews: 2, last7: 2, last30: 2, accuracy: 0, gradable: 2, correct: 0, avgSeconds: 30, totalMinutes: 1, revealedBeforeAnswerRate: 0, hintRate: 0, practiceAnswers: 0, practiceAccuracy: null },
  streak: { current: 1, longest: 1, activeDays: 1 }, states: { new: 0, learning: 0, review: 2, relearning: 0, suspended: 0, flagged: 0, buried: 0, total: 2 },
  estimatedRetention: { value: 0.5, cards: 2, label: 'FSRS' }, gradeDistribution: { again: 2, hard: 0, good: 0, easy: 0 },
  byType: [], series: [], forecast: [], difficultyBuckets: [], stabilityBuckets: [], decks: [], exams: [],
  hardest: questions.map((q, i) => ({ questionId: q.id, prompt: q.prompt, again: 5 - i, deck: '네트워크 복습', type: q.type })),
  leeches: [{ questionId: questions[0]!.id, prompt: questions[0]!.prompt, lapses: 9, deck: '네트워크 복습', type: questions[0]!.type }],
};

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([{ name: 'authjs.session-token', value: 'ui-test-session', url: process.env.E2E_BASE_URL ?? 'http://localhost:3000' }]);
  await page.route('**/*', async (route) => {
    const r = route.request();
    if (!['fetch', 'xhr'].includes(r.resourceType()) || r.headers()['rsc'] === '1') return route.continue();
    const path = new URL(r.url()).pathname;
    if (path === '/api/auth/session') return route.fulfill({ json: { user: { name: 'Tester', email: 'ui@test.local' }, expires: '2099-01-01' } });
    if (path === '/api/token') return route.fulfill({ json: { token: 'ui-test', expiresAt: Date.now() + 3600_000 } });
    if (path === '/settings') return route.fulfill({ json: { shortcutsEnabled: true, essayAnswerView: 'plain' } });
    if (path === '/subjects' || path === '/decks') return route.fulfill({ json: [] });
    if (path === '/shares/received/count') return route.fulfill({ json: { pending: 0 } });
    if (path === '/analytics/overview') return route.fulfill({ json: overview });
    if (path === '/analytics/heatmap') return route.fulfill({ json: { timezone: 'Asia/Seoul', days: [{ day: '2026-10-22', count: 2 }], max: 2 } });
    if (path === '/reviews') return route.fulfill({ json: [
      { id: 'review', rating: 1, isCorrect: false, reviewRound: 3, reviewedAt: '2026-10-22T03:00:00Z', elapsedMs: 12000, undone: false },
      { id: 'undone-review', rating: 3, isCorrect: true, reviewRound: 2, reviewedAt: '2026-10-21T03:00:00Z', elapsedMs: 5000, undone: true },
    ] });
    const question = questions.find((q) => path === `/questions/${q.id}` || path === `/questions/${q.id}/answer-key`);
    if (question) {
      if (path.endsWith('/answer-key')) return route.fulfill({ json: { answerKey: { type: question.type, answer: question.answer }, explanation: question.explanation } });
      return route.fulfill({ json: { externalId: question.id, deckId: 'deck', question: toPublicQuestion(question), card: {
        status: 'REVIEW', reps: 8, lapses: 5, dueAt: '2026-10-23T03:00:00Z', lastReviewAt: '2026-10-22T03:00:00Z', suspended: false, flagged: true,
      } } });
    }
    return route.continue();
  });
});

test('hardest and leech rows open the selected question, answers and history without leaving statistics', async ({ page }) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (r.method() !== 'GET') writes.push(r.url()); });
  await page.goto('/insights');
  await page.getByRole('combobox', { name: '기간', exact: true }).selectOption('7');
  const rows = page.getByRole('list', { name: '가장 자주 틀린 문항', exact: true }).getByRole('button');
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]!;
    await rows.nth(i).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '문항 상세', exact: true });
    await expect(dialog).toContainText(q.prompt.replace(/\*\*/g, ''));
    await expect(dialog).toContainText(q.explanation.summary);
    if (q.type === 'single_choice') await expect(dialog).toContainText(q.choices[0]!.text);
    if (q.type === 'short_answer') await expect(dialog).toContainText(q.answer.acceptedAnswers[0]!);
    await expect(dialog.getByRole('list', { name: '최근 복습 기록' })).toContainText('오답');
    await expect(dialog).toContainText('되돌린 기록');
    await expect(dialog.getByRole('link', { name: '덱에서 보기' })).toHaveAttribute('href', `/decks/deck?q=${q.id}`);
    const size = await dialog.boundingBox();
    expect(size!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(size!.x).toBeGreaterThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(rows.nth(i)).toBeFocused();
  }
  await expect(page.getByRole('combobox', { name: '기간', exact: true })).toHaveValue('7');
  await page.getByRole('list', { name: '리치 문항', exact: true }).getByRole('button').click();
  await expect(page.getByTestId('question-detail')).toContainText(questions[0]!.prompt);
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page).toHaveURL('/insights');
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
});

test('question load errors show retry and recover inside the dialog', async ({ page }) => {
  let fail = true;
  await page.route(`**/questions/${questions[0]!.id}`, (route) => fail
    ? route.fulfill({ status: 404, json: { message: '문항을 불러올 수 없습니다' } }) : route.fallback());
  await page.goto('/insights');
  await page.getByRole('list', { name: '가장 자주 틀린 문항', exact: true }).getByRole('button').first().click();
  const dialog = page.getByTestId('question-detail');
  await expect(dialog.getByRole('alert')).toContainText('문항을 불러올 수 없습니다');
  fail = false;
  await dialog.getByRole('button', { name: '다시 시도' }).click();
  await expect(dialog).toContainText(questions[0]!.prompt);
  await expect(dialog.getByRole('alert')).toBeHidden();
});
