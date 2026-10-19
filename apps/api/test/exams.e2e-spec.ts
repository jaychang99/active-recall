import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, exampleBatch, resetDb } from './helpers';

describe('exams & analytics', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await request(ctx.server).post('/imports/commit').send({ batch: exampleBatch() }).expect(200);
  });

  it('exam grades all 8 types, excludes essay from the objective denominator, and never touches FSRS', async () => {
    const created = await request(ctx.server).post('/exams').send({ deckId: 'computer_networks_01', shuffle: false }).expect(201);
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
    const submitted = await request(ctx.server).post(`/exams/${created.body.id}/submit`).send({ responses }).expect(200);
    expect(submitted.body.score).toMatchObject({ objectiveTotal: 7, objectiveCorrect: 6, essayTotal: 1, essaySelfScore: 8, essayMaxScore: 10, answered: 8 });
    expect(submitted.body.score.objectiveAccuracy).toBeCloseTo(6 / 7);
    expect(submitted.body.questions[4].answerKey.answer.modelAnswer).toBeTruthy();
    // FSRS untouched
    const cards = await ctx.prisma.cardState.findMany();
    expect(cards.every((c) => c.status === 'NEW' && c.reps === 0)).toBe(true);
    expect(await ctx.prisma.reviewLog.count()).toBe(0);
    await request(ctx.server).post(`/exams/${created.body.id}/submit`).send({ responses }).expect(409);
    // retry wrong answers only
    const retry = await request(ctx.server).post('/exams').send({ deckId: 'computer_networks_01', retryOfAttemptId: created.body.id }).expect(201);
    expect(retry.body.questions.map((q: { externalId: string }) => q.externalId)).toEqual(['net-q003']);
    const history = await request(ctx.server).get('/exams?deckId=computer_networks_01').expect(200);
    expect(history.body).toHaveLength(2);
  });

  it('analytics overview reports honest denominators and streaks', async () => {
    const q = await ctx.prisma.question.findFirstOrThrow({ where: { externalId: 'net-q002' } });
    await request(ctx.server).post('/reviews').send({ questionId: q.id, rating: 3, idempotencyKey: 'a-1', isCorrect: true, elapsedMs: 3000 }).expect(201);
    const e = await ctx.prisma.question.findFirstOrThrow({ where: { externalId: 'net-q005' } });
    await request(ctx.server).post('/reviews').send({ questionId: e.id, rating: 2, idempotencyKey: 'a-2', elapsedMs: 9000 }).expect(201); // essay: isCorrect null
    const res = await request(ctx.server).get('/analytics/overview').expect(200);
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
    const heat = await request(ctx.server).get('/analytics/heatmap?days=60').expect(200);
    expect(heat.body.days).toHaveLength(60);
    expect(heat.body.days.at(-1).count).toBe(2);
  });

  it('settings validate timezone; backup round-trips', async () => {
    await request(ctx.server).patch('/settings').send({ timezone: 'Mars/Olympus' }).expect(400);
    const s = await request(ctx.server).patch('/settings').send({ timezone: 'America/New_York', newCardsPerDay: 5 }).expect(200);
    expect(s.body.timezone).toBe('America/New_York');
    const backup = await request(ctx.server).get('/exports/backup.json').expect(200);
    expect(backup.body.questions).toHaveLength(8);
    await resetDb(ctx.prisma);
    const restored = await request(ctx.server).post('/exports/restore').send(backup.body).expect(200);
    expect(restored.body.counts.questions).toBe(8);
    expect(await ctx.prisma.question.count()).toBe(8);
    const csv = await request(ctx.server).get('/exports/reviews.csv').expect(200);
    expect(csv.text.split('\n')[0]).toContain('reviewedAt');
  });
});
