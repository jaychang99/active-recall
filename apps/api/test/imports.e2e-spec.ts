import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, exampleBatch, resetDb } from './helpers';

describe('imports', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => { await resetDb(ctx.prisma); });

  it('validates and previews a batch without writing', async () => {
    const res = await request(ctx.server).post('/imports/validate').send({ batch: exampleBatch() }).expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.counts.created).toBe(8);
    expect(res.body.deck.exists).toBe(false);
    expect(await ctx.prisma.deck.count()).toBe(0);
  });

  it('imports once, then re-import is idempotent (unchanged)', async () => {
    const first = await request(ctx.server).post('/imports/commit').send({ batch: exampleBatch() }).expect(200);
    expect(first.body.counts).toMatchObject({ created: 8, updated: 0, unchanged: 0 });
    const second = await request(ctx.server).post('/imports/commit').send({ batch: exampleBatch() }).expect(200);
    expect(second.body.counts).toMatchObject({ created: 0, updated: 0, unchanged: 8 });
    expect(await ctx.prisma.question.count()).toBe(8);
    expect(await ctx.prisma.cardState.count()).toBe(8);
    // deck subject is assigned to every question
    const subjects = await request(ctx.server).get('/subjects').expect(200);
    expect(subjects.body[0].name).toBe('Computer Networks');
    expect(subjects.body[0].questionCount).toBe(8);
  });

  it('one invalid question rolls back the whole batch', async () => {
    const batch = exampleBatch();
    (batch.questions[3] as { answer: unknown }).answer = { acceptedAnswers: [] };
    const res = await request(ctx.server).post('/imports/commit').send({ batch }).expect(422);
    expect(res.body.error).toBe('VALIDATION_FAILED');
    expect(res.body.details.issues.length).toBeGreaterThan(0);
    expect(await ctx.prisma.deck.count()).toBe(0);
    expect(await ctx.prisma.question.count()).toBe(0);
  });

  it('rejects unknown schemaVersion and semantic errors with pointed issues', async () => {
    const batch = exampleBatch();
    (batch as { schemaVersion: string }).schemaVersion = '0.9.0';
    const res = await request(ctx.server).post('/imports/validate').send({ batch }).expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.issues[0].message).toContain('unsupported schemaVersion');
    const b2 = exampleBatch();
    const q = b2.questions[0];
    if (q?.type === 'single_choice') q.answer.choiceId = 'nope';
    const r2 = await request(ctx.server).post('/imports/validate').send({ batch: b2 }).expect(200);
    expect(r2.body.ok).toBe(false);
    expect(r2.body.issues[0]).toMatchObject({ questionIndex: 0, questionId: 'net-q001', kind: 'semantic' });
  });

  it('content edit keeps scheduling; answer edit resets it and reports resetSchedule', async () => {
    await request(ctx.server).post('/imports/commit').send({ batch: exampleBatch() }).expect(200);
    const q1 = await ctx.prisma.question.findFirstOrThrow({ where: { externalId: 'net-q001' } });
    // simulate learning progress
    const rev = await request(ctx.server).post('/reviews').send({ questionId: q1.id, rating: 3, idempotencyKey: 'k-content-1' }).expect(201);
    expect(rev.body.card.reps).toBe(1);

    const typo = exampleBatch();
    typo.questions[0]!.prompt += ' (오탈자 수정)';
    const r1 = await request(ctx.server).post('/imports/commit').send({ batch: typo }).expect(200);
    expect(r1.body.counts).toMatchObject({ updated: 1, unchanged: 7, resetSchedule: 0 });
    const afterTypo = await ctx.prisma.cardState.findUniqueOrThrow({ where: { questionId: q1.id } });
    expect(afterTypo.reps).toBe(1);
    const row = await ctx.prisma.question.findUniqueOrThrow({ where: { id: q1.id } });
    expect(row.revision).toBe(2);

    const answerEdit = exampleBatch();
    answerEdit.questions[0]!.prompt += ' (오탈자 수정)';
    const q = answerEdit.questions[0];
    if (q?.type === 'single_choice') q.answer.choiceId = 'd';
    const r2 = await request(ctx.server).post('/imports/commit').send({ batch: answerEdit }).expect(200);
    expect(r2.body.counts).toMatchObject({ updated: 1, resetSchedule: 1 });
    const afterAnswer = await ctx.prisma.cardState.findUniqueOrThrow({ where: { questionId: q1.id } });
    expect(afterAnswer.reps).toBe(0);
    expect(afterAnswer.status).toBe('NEW');
    // review history is preserved
    expect(await ctx.prisma.reviewLog.count({ where: { questionId: q1.id } })).toBe(1);
  });

  it('replace_deck soft-deletes missing questions; add_only skips existing', async () => {
    await request(ctx.server).post('/imports/commit').send({ batch: exampleBatch() }).expect(200);
    const smaller = exampleBatch();
    smaller.questions = smaller.questions.slice(0, 5);
    const r = await request(ctx.server).post('/imports/commit').send({ batch: smaller, strategy: 'replace_deck' }).expect(200);
    expect(r.body.counts.deactivated).toBe(3);
    expect(await ctx.prisma.question.count({ where: { deletedAt: null } })).toBe(5);
    const back = await request(ctx.server).post('/imports/commit').send({ batch: exampleBatch(), strategy: 'add_only' }).expect(200);
    expect(back.body.counts.skipped).toBe(5);
    expect(back.body.counts.updated).toBe(3); // reactivated
    expect(await ctx.prisma.question.count({ where: { deletedAt: null } })).toBe(8);
  });

  it('rejects oversized and prototype-polluting bodies', async () => {
    await request(ctx.server).post('/imports/validate').send({ batch: { __proto__: { x: 1 }, schemaVersion: '1.0.0' } }).expect(200).then((r) => expect(r.body.ok).toBe(false));
    const big = 'x'.repeat(6 * 1024 * 1024 + 10);
    await request(ctx.server).post('/imports/validate').set('Content-Type', 'application/json').send(`{"batch":{"pad":"${big}"}}`).expect(413);
  });

  it('exports a deck back to a schema-valid batch', async () => {
    await request(ctx.server).post('/imports/commit').send({ batch: exampleBatch() }).expect(200);
    const res = await request(ctx.server).get('/exports/decks/computer_networks_01/batch.json').expect(200);
    expect(res.body.schemaVersion).toBe('1.0.0');
    expect(res.body.questions).toHaveLength(8);
    const again = await request(ctx.server).post('/imports/validate').send({ batch: res.body }).expect(200);
    expect(again.body.counts.unchanged).toBe(8);
  });
});
