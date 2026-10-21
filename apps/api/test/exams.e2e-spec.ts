import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, exampleBatch, resetDb } from './helpers';

describe('exams & analytics', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let deckId: string;
  let uid: string;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    deckId = (await ctx.api.post('/imports/commit').send({ batch: exampleBatch() }).expect(200)).body.deckId;
    uid = await ctx.userId('a');
  });

  it('exam grades all 8 types, excludes essay from the objective denominator, and never touches FSRS', async () => {
    const created = await ctx.api.post('/exams').send({ deckId, shuffle: false }).expect(201);
    expect(created.body.questions).toHaveLength(8);
    expect(JSON.stringify(created.body.questions)).not.toContain('acceptedAnswers');
    const byExt = new Map(created.body.questions.map((q: { externalId: string; questionId: string }) => [q.externalId, q.questionId]));
    const responses = [
      { questionId: byExt.get('net-q001'), answerPayload: { type: 'single_choice', choiceId: 'a' } },
      { questionId: byExt.get('net-q002'), answerPayload: { type: 'multiple_choice', choiceIds: ['a', 'c'] } },
      { questionId: byExt.get('net-q003'), answerPayload: { type: 'true_false', value: true } }, // wrong
      { questionId: byExt.get('net-q004'), answerPayload: { type: 'short_answer', text: ' 32 Bits ' } },
      { questionId: byExt.get('net-q005'), answerPayload: { type: 'essay', text: 'TCP는 연결지향...' }, selfScores: [3, 2, 3] },
      { questionId: byExt.get('net-q006'), answerPayload: { type: 'cloze', blanks: { b1: '4', b2: '연결' } } },
      { questionId: byExt.get('net-q007'), answerPayload: { type: 'ordering', orderedIds: ['syn', 'synack', 'ack'] } },
      { questionId: byExt.get('net-q008'), answerPayload: { type: 'matching', pairs: [{ leftId: 'dns', rightId: 'name' }, { leftId: 'dhcp', rightId: 'config' }, { leftId: 'arp', rightId: 'mapping' }] } },
    ];
    const submitted = await ctx.api.post(`/exams/${created.body.id}/submit`).send({ responses }).expect(200);
    expect(submitted.body.score).toMatchObject({ objectiveTotal: 7, objectiveCorrect: 6, essayTotal: 1, essaySelfScore: 8, essayMaxScore: 10, answered: 8 });
    expect(submitted.body.score.objectiveAccuracy).toBeCloseTo(6 / 7);
    expect(submitted.body.questions[4].answerKey.answer.modelAnswer).toBeTruthy();
    expect(submitted.body.questions[4].answerKey.answer.modelAnswerSegments).toHaveLength(6); // scored model answer travels with the key
    // FSRS untouched
    const cards = await ctx.prisma.cardState.findMany({ where: { userId: uid } });
    expect(cards.every((c) => c.status === 'NEW' && c.reps === 0)).toBe(true);
    expect(await ctx.prisma.reviewLog.count({ where: { userId: uid } })).toBe(0);
    await ctx.api.post(`/exams/${created.body.id}/submit`).send({ responses }).expect(409);
    // retry wrong answers only
    const retry = await ctx.api.post('/exams').send({ deckId, retryOfAttemptId: created.body.id }).expect(201);
    expect(retry.body.questions.map((q: { externalId: string }) => q.externalId)).toEqual(['net-q003']);
    const history = await ctx.api.get(`/exams?deckId=${deckId}`).expect(200);
    expect(history.body).toHaveLength(2);
  });

  it('analytics overview reports honest denominators and streaks', async () => {
    const q = await ctx.prisma.question.findFirstOrThrow({ where: { userId: uid, externalId: 'net-q002' } });
    await ctx.api.post('/reviews').send({ questionId: q.id, rating: 3, idempotencyKey: 'a-1', isCorrect: true, elapsedMs: 3000 }).expect(201);
    const e = await ctx.prisma.question.findFirstOrThrow({ where: { userId: uid, externalId: 'net-q005' } });
    await ctx.api.post('/reviews').send({ questionId: e.id, rating: 2, idempotencyKey: 'a-2', elapsedMs: 9000 }).expect(201); // essay: isCorrect null
    const res = await ctx.api.get('/analytics/overview').expect(200);
    expect(res.body.today.reviewed).toBe(2);
    expect(res.body.today.gradable).toBe(1);
    expect(res.body.today.accuracy).toBe(1);
    expect(res.body.window.reviews).toBe(2);
    expect(res.body.streak.current).toBe(1);
    expect(res.body.gradeDistribution).toMatchObject({ good: 1, hard: 1 });
    expect(res.body.states.total).toBe(8);
    expect(res.body.estimatedRetention.label).toContain('estimate');
    expect(res.body.series).toHaveLength(30);
    expect(res.body.forecast).toHaveLength(30);
    const heat = await ctx.api.get('/analytics/heatmap?days=60').expect(200);
    expect(heat.body.days).toHaveLength(60);
    expect(heat.body.days.at(-1).count).toBe(2);
  });

  it('settings validate timezone; backup round-trips', async () => {
    await ctx.api.patch('/settings').send({ timezone: 'Mars/Olympus' }).expect(400);
    const s = await ctx.api.patch('/settings').send({ timezone: 'America/New_York', newCardsPerDay: 5, hideTags: true, hideSource: true, hideRound: true }).expect(200);
    expect(s.body.timezone).toBe('America/New_York');
    // study metadata mask: five independent booleans, default off, persisted
    expect([s.body.hideDifficulty, s.body.hideTags, s.body.hideSubject, s.body.hideSource, s.body.hideRound]).toEqual([false, true, false, true, true]);
    const g = await ctx.api.get('/settings').expect(200);
    expect([g.body.hideDifficulty, g.body.hideTags, g.body.hideSubject, g.body.hideSource, g.body.hideRound]).toEqual([false, true, false, true, true]);
    expect(g.body.revealMetaOnAnswer).toBe(false);
    expect((await ctx.api.patch('/settings').send({ revealMetaOnAnswer: true }).expect(200)).body.revealMetaOnAnswer).toBe(true);
    // essay model answer view: plain by default, scored persists, anything else is rejected
    expect(g.body.essayAnswerView).toBe('plain');
    expect((await ctx.api.patch('/settings').send({ essayAnswerView: 'scored' }).expect(200)).body.essayAnswerView).toBe('scored');
    await ctx.api.patch('/settings').send({ essayAnswerView: 'fancy' }).expect(400);
    const backup = await ctx.api.get('/exports/backup.json').expect(200);
    expect(backup.body.version).toBe(2);
    expect(backup.body.questions).toHaveLength(8);
    expect(backup.body.decks[0].slug).toBe('computer_networks_01');
    expect(backup.body.decks[0].userId).toBeUndefined();
    await resetDb(ctx.prisma);
    const restored = await ctx.api.post('/exports/restore').send(backup.body).expect(200);
    expect(restored.body.counts.questions).toBe(8);
    const uid2 = await ctx.userId('a');
    expect(await ctx.prisma.question.count({ where: { userId: uid2 } })).toBe(8);
    // ids were regenerated, foreign keys re-mapped, settings carried over
    const deck = await ctx.prisma.deck.findFirstOrThrow({ where: { userId: uid2 } });
    expect(deck.id).not.toBe(deckId);
    expect(await ctx.prisma.question.count({ where: { userId: uid2, deckId: deck.id } })).toBe(8);
    expect((await ctx.api.get('/settings').expect(200)).body.newCardsPerDay).toBe(5);
    // restoring again without force is refused; with force it replaces
    await ctx.api.post('/exports/restore').send(backup.body).expect(409);
    await ctx.api.post('/exports/restore?force=true').send(backup.body).expect(200);
    expect(await ctx.prisma.question.count({ where: { userId: uid2 } })).toBe(8);
    const csv = await ctx.api.get('/exports/reviews.csv').expect(200);
    expect(csv.text.split('\n')[0]).toContain('reviewedAt');
  });
});
