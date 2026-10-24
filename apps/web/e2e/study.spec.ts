import { expect, test } from './fixtures';
import { API, gotoStudy, seedDeck } from './helpers';

test.describe('study flow (keyboard-first)', () => {
  let deckId = '';
  test.beforeEach(async ({ api }) => { ({ deckId } = await seedDeck(api)); });

  test('answers all 8 question types with the keyboard and rates with FSRS', async ({ page, api }) => {
    await gotoStudy(page, deckId, 'cram');
    // cram order is shuffled by minute seed; detect each type and answer accordingly
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const screen = page.getByTestId('study-screen');
      await expect(screen).toHaveAttribute('data-phase', 'answering');
      const typeBadge = ({ single_choice: '단일선택', multiple_choice: '복수선택', true_false: 'OX', short_answer: '단답형', essay: '서술형', cloze: '빈칸', ordering: '순서배열', matching: '연결형' } as Record<string, string>)[(await screen.getAttribute('data-type')) ?? ''] ?? '';
      seen.add(typeBadge);
      switch (typeBadge) {
        case '단일선택':
          await page.keyboard.press('1'); // SYN is first when shuffle is off
          await expect(page.locator('[data-choice-id="a"]')).toHaveAttribute('aria-checked', 'true');
          await page.keyboard.press('Enter');
          break;
        case '복수선택':
          await page.keyboard.press('1');
          await page.keyboard.press('3');
          await page.keyboard.press('Enter');
          break;
        case 'OX':
          await page.keyboard.press('2');
          await page.keyboard.press('Enter');
          break;
        case '단답형':
          await page.getByLabel('단답형 답안').fill('32비트');
          await page.keyboard.press('Enter');
          break;
        case '서술형':
          await page.getByLabel('서술형 답안').fill('TCP는 연결 지향이고 UDP는 비연결이다.\n둘째 줄');
          await page.keyboard.press('Enter'); // newline, must not submit
          await expect(screen).toHaveAttribute('data-phase', 'answering');
          await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
          break;
        case '빈칸':
          await page.getByLabel('빈칸 1').fill('4');
          await page.keyboard.press('Enter'); // moves to blank 2
          await page.getByLabel('빈칸 2').fill('연결');
          await page.keyboard.press('Enter');
          break;
        case '순서배열': {
          // fix the order with the move buttons until it reads syn, synack, ack
          const want = ['클라이언트가 SYN 전송', '서버가 SYN+ACK 전송', '클라이언트가 ACK 전송'];
          for (let target = 0; target < want.length; target++) {
            for (let guard = 0; guard < 4; guard++) {
              const texts = await page.locator('[data-testid="ordering-list"] li').allInnerTexts();
              const pos = texts.findIndex((t) => t.includes(want[target]!));
              if (pos === target) break;
              await page.locator('[data-testid="ordering-list"] li').nth(pos).getByLabel('위로').click();
            }
          }
          await page.getByTestId('submit-btn').click();
          break;
        }
        case '연결형':
          await page.getByLabel('DNS에 연결할 항목').selectOption('name');
          await page.getByLabel('DHCP에 연결할 항목').selectOption('config');
          await page.getByLabel('ARP에 연결할 항목').selectOption('mapping');
          await page.getByTestId('submit-btn').click();
          break;
      }
      await expect(screen).toHaveAttribute('data-phase', 'submitted');
      await expect(page.getByTestId('explanation')).toBeVisible();
      const verdict = await page.getByTestId('verdict').getAttribute('data-verdict');
      expect(typeBadge === '서술형' ? 'manual' : 'correct').toBe(verdict);
      if (typeBadge === '서술형') {
        await page.getByTestId('rubric').getByRole('radio', { name: '3' }).first().click();
      }
      // digit keys now grade: 3 = Good
      await page.keyboard.press('3');
      await expect(screen).toHaveAttribute('data-phase', i === 7 ? /.*/ : 'answering');
    }
    expect(seen.size).toBe(8);
    await expect(page.getByTestId('session-summary')).toBeVisible();
    const reviews = await (await api.get(`${API}/analytics/overview`)).json();
    expect(reviews.today.reviewed).toBeGreaterThanOrEqual(8);
  });

  test('Space reveals without answering; U reopens the card with its answer for re-rating', async ({ page, api }) => {
    await api.patch(`${API}/settings`, { data: { autoAdvanceAfterRating: false } });
    await gotoStudy(page, deckId, 'scheduled');
    const screen = page.getByTestId('study-screen');
    await page.keyboard.press('Space');
    await expect(screen).toHaveAttribute('data-phase', 'submitted');
    await expect(page.getByTestId('verdict')).toHaveAttribute('data-verdict', 'revealed');
    await page.keyboard.press('2'); // Hard
    await expect(screen).toHaveAttribute('data-phase', 'rated');
    const q = await (await api.get(`${API}/study/queue?deckId=${deckId}&mode=cram&limit=100`)).json();
    expect(q.items.filter((i: { card: { reps: number } }) => i.card.reps === 1)).toHaveLength(1);
    await page.keyboard.press('u');
    await expect(screen).toHaveAttribute('data-phase', 'submitted');
    await expect(page.getByTestId('rating-bar')).toBeVisible();
    const q2 = await (await api.get(`${API}/study/queue?deckId=${deckId}&mode=cram&limit=100`)).json();
    expect(q2.items.filter((i: { card: { reps: number } }) => i.card.reps === 1)).toHaveLength(0);
    // Undo bumps the card version: rating the same card again must not 409 (regression: stale version in the frozen queue)
    await page.keyboard.press('3');
    await expect(screen).toHaveAttribute('data-phase', 'rated');
    await expect(page.getByText('평가를 저장하지 못했습니다')).toHaveCount(0);
    // ...and the same after undo + reload (the snapshot keeps the open answer, versions re-synced from the server)
    await page.keyboard.press('u');
    await expect(screen).toHaveAttribute('data-phase', 'submitted');
    await page.reload();
    await expect(screen).toHaveAttribute('data-phase', 'submitted');
    await page.keyboard.press('3');
    await expect(screen).toHaveAttribute('data-phase', 'rated');
    await expect(page.getByText('평가를 저장하지 못했습니다')).toHaveCount(0);
  });

  test('←/→, the jump box and Cmd/Ctrl+Z move between cards and re-rate', async ({ page, api }) => {
    await api.patch(`${API}/settings`, { data: { autoAdvanceAfterRating: true } });
    await gotoStudy(page, deckId, 'scheduled');
    const screen = page.getByTestId('study-screen');
    const jump = page.getByTestId('nav-jump');
    const first = (await screen.getAttribute('data-question-id'))!;
    // Text answers are auto-focused and keep ←/→ for the caret; Esc leaves the field.
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await expect(jump).toHaveAttribute('placeholder', '2');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowLeft');
    await expect(screen).toHaveAttribute('data-question-id', first);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Space');
    await expect(screen).toHaveAttribute('data-phase', 'submitted');
    await page.keyboard.press('3');
    await expect(jump).toHaveAttribute('placeholder', '2');
    await expect(page.getByTestId('study-nav-track').locator('[data-status]').first()).toHaveAttribute('data-status', 'rated');
    // Right after auto-advance (even inside an untouched, auto-focused field) Cmd/Ctrl+Z reopens the last card.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect(screen).toHaveAttribute('data-question-id', first);
    await expect(screen).toHaveAttribute('data-phase', 'submitted');
    await expect(page.getByTestId('rating-bar')).toBeVisible();
    await page.keyboard.press('4');
    await expect(jump).toHaveAttribute('placeholder', '2');
    const q = await (await api.get(`${API}/study/queue?deckId=${deckId}&mode=cram&limit=100`)).json();
    expect(q.items.filter((i: { card: { reps: number } }) => i.card.reps === 1)).toHaveLength(1);
    await page.keyboard.press('Escape');
    await page.keyboard.press('g');
    await expect(jump).toBeFocused();
    await jump.fill('4');
    await jump.press('Enter');
    await expect(jump).toHaveAttribute('placeholder', '4');
  });

  test('이전 응답 보기 shows earlier rounds after submit/reveal, closed by default, with an empty fallback', async ({ page, api }) => {
    await api.patch(`${API}/settings`, { data: { autoAdvanceAfterRating: false } });
    await gotoStudy(page, deckId, 'scheduled');
    const screen = page.getByTestId('study-screen');
    const toggle = page.getByTestId('previous-toggle');
    await expect(toggle).toHaveCount(0); // only once the answer is open
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('previous-responses')).toHaveCount(0);
    await page.keyboard.press('r');
    await expect(page.getByTestId('previous-responses-empty')).toBeVisible();
    await page.keyboard.press('1'); // Again re-queues the card for a second round today
    await expect(screen).toHaveAttribute('data-phase', 'rated');
    const first = (await screen.getAttribute('data-question-id'))!;
    // walk to the re-queued copy at the end of the session
    await page.getByTestId('nav-jump').fill(String(await page.getByTestId('study-nav-track').locator('[data-status]').count()));
    await page.getByTestId('nav-jump').press('Enter');
    await expect(screen).toHaveAttribute('data-question-id', first);
    await expect(screen).toHaveAttribute('data-round', '2');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    const entries = page.getByTestId('previous-response');
    await expect(entries).toHaveCount(1);
    await expect(entries.first()).toContainText('1회차');
    await expect(entries.first()).toContainText('답을 입력하지 않고 정답을 공개했습니다.');
  });

  test('notes: one note per review round, visible as history after rating', async ({ page }) => {
    await gotoStudy(page, deckId, 'scheduled');
    await page.keyboard.press('m');
    const note = page.getByTestId('note-input');
    await expect(note).toBeFocused();
    await note.fill('1회차 메모: 핸드셰이크 순서 주의');
    await page.keyboard.press('1'); // typing in textarea → must NOT select a choice
    await expect(page.locator('[data-choice-id] [aria-checked="true"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(note).not.toBeFocused();
    await expect(page.getByText('저장됨')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('study-screen')).toHaveAttribute('data-phase', 'submitted');
    await page.keyboard.press('1'); // Again → learning; card re-queued at the end
    await expect(page.getByTestId('study-screen')).toHaveAttribute('data-round', '1');
    // advance through remaining cards quickly by revealing + Good until the first card comes back
    for (let i = 0; i < 25; i++) {
      const screen = page.getByTestId('study-screen');
      if (!(await screen.isVisible())) break;
      await expect(screen).toHaveAttribute('data-phase', 'answering');
      const round = await screen.getAttribute('data-round');
      if (round === '2') {
        await page.getByTestId('notes-panel').getByRole('button').first().click();
        await page.getByRole('button', { name: /이전 회차 메모 1개 보기/ }).click();
        await expect(page.getByTestId('note-history')).toContainText('1회차 메모: 핸드셰이크 순서 주의');
        return;
      }
      await page.getByTestId('reveal-btn').click();
      await expect(screen).toHaveAttribute('data-phase', 'submitted');
      await page.locator('[data-rating="3"]').click();
    }
    throw new Error('round 2 of the first card was never reached');
  });

  test('Korean IME composition Enter does not submit a short answer', async ({ page }) => {
    await gotoStudy(page, deckId, 'cram');
    // navigate until a short-answer card appears (cram order is seeded by minute)
    for (let i = 0; i < 8; i++) {
      const screen = page.getByTestId('study-screen');
      await expect(screen).toHaveAttribute('data-phase', 'answering');
      if ((await screen.getAttribute('data-type')) === 'short_answer') break;
      await page.getByTestId('reveal-btn').click();
      await expect(screen).toHaveAttribute('data-phase', 'submitted');
      await page.locator('[data-rating="3"]').click();
    }
    const input = page.getByLabel('단답형 답안');
    await input.focus();
    await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement;
      el.value = '삼십이';
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    });
    await expect(page.getByTestId('study-screen')).toHaveAttribute('data-phase', 'answering');
  });

  test('the current card survives a reload and a refetch; progress is kept', async ({ page }) => {
    await gotoStudy(page, deckId, 'cram');
    const screen = page.getByTestId('study-screen');
    const first = await screen.getAttribute('data-question-id');
    await page.getByTestId('reveal-btn').click();
    await expect(screen).toHaveAttribute('data-phase', 'submitted');
    await page.locator('[data-rating="3"]').click();
    await expect(screen).toHaveAttribute('data-phase', 'answering');
    const second = await screen.getAttribute('data-question-id');
    expect(second).not.toBe(first);
    await page.reload();
    await expect(page.getByTestId('study-screen')).toBeVisible();
    expect(await page.getByTestId('study-screen').getAttribute('data-question-id')).toBe(second);
    await expect(page.getByText('1 / 8 완료')).toBeVisible();
  });
});
