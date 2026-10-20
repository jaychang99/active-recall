import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, exampleBatch, resetDb } from './helpers';

describe('authentication', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });

  it('rejects missing, malformed and forged tokens; health and schemas stay public', async () => {
    await request(ctx.server).get('/decks').expect(401).then((r) => expect(r.body.error).toBe('UNAUTHORIZED'));
    await request(ctx.server).get('/decks').set('Authorization', 'Bearer nope').expect(401);
    await request(ctx.server).get('/decks').set('Authorization', `Bearer ${ctx.tokens.a!.split('.').slice(0, 2).join('.')}.Zm9yZ2Vk`).expect(401);
    await request(ctx.server).get('/health').expect(200);
    await request(ctx.server).get('/schemas/question-batch.schema.json').expect(200);
  });

  it('creates the user on first call and reports it on /auth/me', async () => {
    await resetDb(ctx.prisma);
    const me = await ctx.api.get('/auth/me').expect(200);
    expect(me.body.email).toBe('a@test.local');
    expect(me.body.provider).toBe('dev');
    expect(await ctx.prisma.user.count()).toBe(1);
    await ctx.api.get('/auth/me').expect(200);
    expect(await ctx.prisma.user.count()).toBe(1);
  });
});

describe('per-user isolation', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let aDeck: string;
  let aQ: string;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    aDeck = (await ctx.api.post('/imports/commit').send({ batch: exampleBatch() }).expect(200)).body.deckId;
    aQ = (await ctx.prisma.question.findFirstOrThrow({ where: { userId: await ctx.userId('a'), externalId: 'net-q001' } })).id;
  });

  it("B sees none of A's decks, questions, subjects, notes, exams or stats", async () => {
    const b = ctx.as('b');
    expect((await b.get('/decks').expect(200)).body).toEqual([]);
    expect((await b.get('/decks/by-subject').expect(200)).body).toEqual([]);
    expect((await b.get('/subjects').expect(200)).body).toEqual([]);
    await b.get(`/decks/${aDeck}`).expect(404);
    await b.get(`/decks/${aDeck}/questions`).expect(404);
    await b.get(`/decks/${aDeck}/notes`).expect(404);
    await b.patch(`/decks/${aDeck}`).send({ title: 'hijack' }).expect(404);
    await b.delete(`/decks/${aDeck}?permanent=true`).expect(404);
    await b.get(`/questions/${aQ}`).expect(404);
    await b.post(`/questions/${aQ}/grade`).send({ answerPayload: { type: 'single_choice', choiceId: 'a' } }).expect(404);
    await b.get(`/questions/${aQ}/answer-key`).expect(404);
    await b.put(`/questions/${aQ}/notes/1`).send({ body: 'x' }).expect(404);
    await b.post(`/cards/${aQ}/flag`).expect(404);
    await b.post('/reviews').send({ questionId: aQ, rating: 3, idempotencyKey: 'b-steal' }).expect(404);
    await b.get(`/study/queue?deckId=${aDeck}`).expect(404);
    await b.post('/study/sessions').send({ scope: aDeck }).expect(404);
    await b.post('/exams').send({ deckId: aDeck }).expect(404);
    await b.get(`/exports/decks/${aDeck}/batch.json`).expect(404);
    expect((await b.get('/study/queue').expect(200)).body.counts.total).toBe(0);
    expect((await b.get('/analytics/overview').expect(200)).body.states.total).toBe(0);
    expect((await b.get('/exports/backup.json').expect(200)).body.questions).toEqual([]);
    // A still has everything
    expect((await ctx.api.get('/decks').expect(200)).body).toHaveLength(1);
    expect((await ctx.api.get('/analytics/overview').expect(200)).body.states.total).toBe(8);
  });

  it('the admin data manager is scoped too, including reference fields', async () => {
    const b = ctx.as('b');
    expect((await b.get('/admin/counts').expect(200)).body.questions.live).toBe(0);
    expect((await b.get('/admin/questions').expect(200)).body.total).toBe(0);
    await b.get(`/admin/decks/${aDeck}`).expect(404);
    await b.patch(`/admin/questions/${aQ}`).send({ sortIndex: 99 }).expect(404);
    await b.delete(`/admin/decks/${aDeck}?permanent=true`).expect(404);
    // B cannot attach rows to A's question or deck
    await b.post('/admin/notes').send({ questionId: aQ, reviewRound: 1, body: 'x' }).expect(404);
    await b.post('/admin/questions').send({ deckId: aDeck, payloadJson: exampleBatch().questions[0] }).expect(404);
    expect((await b.get('/admin/questions/options').expect(200)).body).toEqual([]);
    expect(await ctx.prisma.deck.count({ where: { id: aDeck, userId: await ctx.userId('a') } })).toBe(1);
  });

  it('settings, subjects, deck slugs and idempotency keys are per user', async () => {
    const b = ctx.as('b');
    await ctx.api.patch('/settings').send({ newCardsPerDay: 5 }).expect(200);
    expect((await b.get('/settings').expect(200)).body.newCardsPerDay).toBe(20);
    // same batch (same deck slug) imported by B → separate deck
    const bDeck = (await b.post('/imports/commit').send({ batch: exampleBatch() }).expect(200)).body.deckId;
    expect(bDeck).not.toBe(aDeck);
    expect((await b.get('/decks').expect(200)).body).toHaveLength(1);
    expect((await ctx.api.get('/decks').expect(200)).body).toHaveLength(1);
    // same subject name on both sides
    await ctx.api.post('/subjects').send({ name: 'Shared Name', color: '#f00' }).expect(201);
    await b.post('/subjects').send({ name: 'Shared Name', color: '#0f0' }).expect(201);
    expect((await b.get('/subjects').expect(200)).body.find((s: { name: string }) => s.name === 'Shared Name').color).toBe('#0f0');
    // same idempotency key on both sides → two reviews, no replay across users
    const bQ = (await ctx.prisma.question.findFirstOrThrow({ where: { userId: await ctx.userId('b'), externalId: 'net-q001' } })).id;
    const ra = await ctx.api.post('/reviews').send({ questionId: aQ, rating: 3, idempotencyKey: 'same-key' }).expect(201);
    const rb = await b.post('/reviews').send({ questionId: bQ, rating: 1, idempotencyKey: 'same-key' }).expect(201);
    expect(rb.body.replayed).toBe(false);
    expect(rb.body.review.id).not.toBe(ra.body.review.id);
    expect(await ctx.prisma.reviewLog.count({ where: { userId: await ctx.userId('a') } })).toBe(1);
    expect(await ctx.prisma.reviewLog.count({ where: { userId: await ctx.userId('b') } })).toBe(1);
    // B cannot undo A's review
    await b.post(`/reviews/${ra.body.review.id}/undo`).expect(404);
  });

  it('restores a single-user (v1) backup into an account with re-mapped ids', async () => {
    // Build A's history: a review and a note, then shape the backup like the v1 (pre-multi-user) format.
    const review = await ctx.api.post('/reviews').send({ questionId: aQ, rating: 3, idempotencyKey: 'v1-k1' }).expect(201);
    await ctx.api.put(`/questions/${aQ}/notes/1`).send({ body: 'round one' }).expect(200);
    const v2 = (await ctx.api.get('/exports/backup.json').expect(200)).body;
    const v1 = {
      ...v2,
      version: 1,
      decks: v2.decks.map(({ slug, ...d }: { slug: string; id: string }) => ({ ...d, id: slug })),
      questions: v2.questions.map((q: { deckId: string }) => ({ ...q, deckId: 'computer_networks_01' })),
      sessions: v2.sessions.map((s: { deckId: string | null }) => ({ ...s, deckId: s.deckId ? 'computer_networks_01' : null })),
      exams: v2.exams.map((e: { deckId: string }) => ({ ...e, deckId: 'computer_networks_01' })),
      settings: v2.settings.map((s: object) => ({ ...s, id: 1 })),
    };
    const b = ctx.as('b');
    const restored = await b.post('/exports/restore').send(v1).expect(200);
    expect(restored.body.version).toBe(1);
    expect(restored.body.counts).toMatchObject({ decks: 1, questions: 8, cards: 8, reviews: 1, notes: 1, settings: 1 });
    const decks = (await b.get('/decks').expect(200)).body;
    expect(decks).toHaveLength(1);
    expect(decks[0].slug).toBe('computer_networks_01');
    expect(decks[0].id).not.toBe(aDeck);
    const bQ = (await ctx.prisma.question.findFirstOrThrow({ where: { userId: await ctx.userId('b'), externalId: 'net-q001' } })).id;
    expect(bQ).not.toBe(aQ);
    const notes = await b.get(`/questions/${bQ}/notes`).expect(200);
    expect(notes.body.currentRound).toBe(2);
    expect(notes.body.notes[0].body).toBe('round one');
    expect(notes.body.notes[0].review.id).not.toBe(review.body.review.id);
    expect(notes.body.notes[0].review.rating).toBe(3);
    const subjects = await b.get('/subjects').expect(200);
    expect(subjects.body[0]).toMatchObject({ name: 'Computer Networks', questionCount: 8 });
    // A is untouched
    expect((await ctx.api.get('/analytics/overview').expect(200)).body.states.total).toBe(8);
    expect(await ctx.prisma.question.count({ where: { userId: await ctx.userId('a') } })).toBe(8);
  });
});

describe('account deletion', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });

  /** One row (at least) in every user-owned table: import, subject, review + note, session + practice, exam + responses, settings. */
  async function populate(name: 'a' | 'b') {
    const as = ctx.as(name);
    const deckId = (await as.post('/imports/commit').send({ batch: exampleBatch() }).expect(200)).body.deckId;
    const uid = await ctx.userId(name);
    const qid = (await ctx.prisma.question.findFirstOrThrow({ where: { userId: uid, externalId: 'net-q001' } })).id;
    await as.post('/subjects').send({ name: `Extra ${name}`, color: '#123456' }).expect(201);
    await as.post('/reviews').send({ questionId: qid, rating: 3, idempotencyKey: `${name}-del-1` }).expect(201);
    await as.put(`/questions/${qid}/notes/1`).send({ body: `note ${name}` }).expect(200);
    const session = await as.post('/study/sessions').send({ scope: deckId }).expect(201);
    await as.post('/study/practice').send({ questionId: qid, sessionId: session.body.id, answerPayload: { type: 'single_choice', choiceId: 'a' } }).expect(201);
    const exam = await as.post('/exams').send({ deckId, shuffle: false }).expect(201);
    await as.post(`/exams/${exam.body.id}/submit`).send({ responses: [{ questionId: qid, answerPayload: { type: 'single_choice', choiceId: 'a' } }] }).expect(200);
    await as.patch('/settings').send({ newCardsPerDay: 7 }).expect(200);
    return uid;
  }

  async function countsFor(userId: string) {
    const where = { where: { userId } };
    const p = ctx.prisma;
    return {
      decks: await p.deck.count(where),
      questions: await p.question.count(where),
      subjects: await p.subject.count(where),
      questionSubjects: await p.questionSubject.count(where),
      cards: await p.cardState.count(where),
      reviews: await p.reviewLog.count(where),
      notes: await p.questionNote.count(where),
      sessions: await p.studySession.count(where),
      practices: await p.practiceLog.count(where),
      exams: await p.examAttempt.count(where),
      examResponses: await p.examResponse.count(where),
      settings: await p.appSettings.count(where),
    };
  }

  it("DELETE /auth/me purges every row A owns and leaves B's data intact", async () => {
    await resetDb(ctx.prisma);
    const aId = await populate('a');
    const bId = await populate('b');
    const aBefore = await countsFor(aId);
    const bBefore = await countsFor(bId);
    for (const [table, n] of Object.entries(aBefore)) expect(n, `A ${table}`).toBeGreaterThan(0);

    const res = await ctx.api.delete('/auth/me').expect(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.counts).toEqual(aBefore);

    expect(await ctx.prisma.user.count({ where: { id: aId } })).toBe(0);
    for (const [table, n] of Object.entries(await countsFor(aId))) expect(n, `A ${table}`).toBe(0);
    expect(await countsFor(bId)).toEqual(bBefore);
    expect(await ctx.prisma.user.count({ where: { id: bId } })).toBe(1);
    expect((await ctx.as('b').get('/decks').expect(200)).body).toHaveLength(1);

    // A signing in again starts from an empty account
    expect((await ctx.api.get('/decks').expect(200)).body).toEqual([]);
    expect(await ctx.userId('a')).not.toBe(aId);
  });
});
