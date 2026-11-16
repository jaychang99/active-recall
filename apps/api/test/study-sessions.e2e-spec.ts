import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, exampleBatch, resetDb } from './helpers';

type Item = { questionId: string; reviewRound: number; position: number; card: { version: number } };

describe('shared study sessions (reload, tabs, devices)', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let deckId: string;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    deckId = (await ctx.api.post('/imports/commit').send({ batch: exampleBatch() }).expect(200)).body.deckId;
  });

  it('reopening the same study page joins the active session with the same queue; fresh starts over', async () => {
    const a = (await ctx.api.post('/study/sessions/open').send({ scope: deckId, mode: 'cram' }).expect(201)).body;
    expect(a.resumed).toBe(false);
    expect(a.items).toHaveLength(8);
    expect(a.newItems.map((i: Item) => i.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(a.queue.counts.total).toBe(8);
    await ctx.api.patch(`/study/sessions/${a.session.id}/position`).send({ position: 5 }).expect(200);

    const b = (await ctx.api.post('/study/sessions/open').send({ scope: deckId, mode: 'cram' }).expect(201)).body;
    expect(b.resumed).toBe(true);
    expect(b.session.id).toBe(a.session.id);
    expect(b.session.lastPosition).toBe(5);
    expect(b.newItems.map((i: Item) => i.questionId)).toEqual(a.newItems.map((i: Item) => i.questionId)); // same frozen order

    // other parameters are another session
    const other = (await ctx.api.post('/study/sessions/open').send({ scope: deckId, mode: 'cram', limit: 3 }).expect(201)).body;
    expect(other.session.id).not.toBe(a.session.id);

    const fresh = (await ctx.api.post('/study/sessions/open').send({ scope: deckId, mode: 'cram', fresh: true }).expect(201)).body;
    expect(fresh.resumed).toBe(false);
    expect(fresh.session.id).not.toBe(a.session.id);
    expect((await ctx.prisma.studySession.findFirstOrThrow({ where: { id: a.session.id, userId: await ctx.userId('a') } })).endedAt).not.toBeNull();
  });

  it('an ended or idle session is not joined; moving back into an ended one reopens it', async () => {
    const a = (await ctx.api.post('/study/sessions/open').send({ scope: deckId, mode: 'cram' }).expect(201)).body;
    await ctx.api.patch(`/study/sessions/${a.session.id}/end`).expect(200);
    await ctx.api.patch(`/study/sessions/${a.session.id}/position`).send({ position: 7 }).expect(200);
    expect((await ctx.api.post('/study/sessions/open').send({ scope: deckId, mode: 'cram' }).expect(201)).body.session.id).toBe(a.session.id);
    await ctx.prisma.studySession.update({ where: { id: a.session.id, userId: await ctx.userId('a') }, data: { lastActiveAt: new Date(Date.now() - 7 * 3600_000) } });
    expect((await ctx.api.post('/study/sessions/open').send({ scope: deckId, mode: 'cram' }).expect(201)).body.session.id).not.toBe(a.session.id);
  });

  it('shares opened answers, ratings, re-queued copies and skips between devices', async () => {
    const a = (await ctx.api.post('/study/sessions/open').send({ scope: deckId, mode: 'scheduled' }).expect(201)).body;
    const sid = a.session.id;
    const first = a.newItems[0] as Item;
    const answer = { type: 'single_choice', choiceId: 'a' };
    await ctx.api.put(`/study/sessions/${sid}/items/0/state`).send({ answerPayload: answer, revealedBeforeAnswer: false, hintUsed: true }).expect(200);
    const review = (await ctx.api.post('/reviews').send({ questionId: first.questionId, rating: 1, idempotencyKey: 'ss-1', sessionId: sid, expectedVersion: first.card.version }).expect(201)).body;
    const copy = (await ctx.api.post(`/study/sessions/${sid}/items`).send({ questionId: first.questionId, reviewRound: 2 }).expect(201)).body;
    expect(copy.position).toBe(8);
    expect((await ctx.api.post(`/study/sessions/${sid}/items`).send({ questionId: first.questionId, reviewRound: 2 }).expect(201)).body.position).toBe(8); // idempotent
    await ctx.api.patch(`/study/sessions/${sid}/items/3`).send({ skipped: true }).expect(200);

    // the other device knows 8 entries and asks for the rest
    const s = (await ctx.api.get(`/study/sessions/${sid}/state?known=8`).expect(200)).body;
    expect(s.items).toHaveLength(9);
    expect(s.items[0]).toMatchObject({ phase: 'submitted', answerPayload: answer, hintUsed: true });
    expect(s.items[3].skipped).toBe(true);
    expect(s.newItems.map((i: Item) => [i.position, i.reviewRound])).toEqual([[8, 2]]);
    expect(s.reviews).toEqual([expect.objectContaining({ id: review.review.id, questionId: first.questionId, reviewRound: 1, rating: 1, sessionId: sid, isCorrect: null })]);
    expect(s.cards.find((c: { questionId: string }) => c.questionId === first.questionId).version).toBe(review.card.version);

    // undo: the untouched copy can be dropped, then re-appended at the end
    await ctx.api.post(`/reviews/${review.review.id}/undo`).expect(200);
    await ctx.api.delete(`/study/sessions/${sid}/items/8`).expect(200);
    await ctx.api.delete(`/study/sessions/${sid}/items/0`).expect(409); // opened entries stay
    expect((await ctx.api.get(`/study/sessions/${sid}/state`).expect(200)).body.reviews).toEqual([]);
    expect((await ctx.api.post(`/study/sessions/${sid}/items`).send({ questionId: first.questionId, reviewRound: 2 }).expect(201)).body.position).toBe(9);
  });

  it('browse sessions resume but stay out of the history; sessions are private', async () => {
    const a = (await ctx.api.post('/study/sessions/open').send({ scope: deckId, mode: 'browse', limit: 1000 }).expect(201)).body;
    expect(a.session.mode).toBe('browse');
    expect(a.newItems[0].preview).toBeNull();
    expect((await ctx.api.post('/study/sessions/open').send({ scope: deckId, mode: 'browse', limit: 1000 }).expect(201)).body.session.id).toBe(a.session.id);
    expect((await ctx.api.get('/study/sessions').expect(200)).body).toEqual([]);
    await ctx.as('b').get(`/study/sessions/${a.session.id}/state`).expect(404);
    await ctx.as('b').patch(`/study/sessions/${a.session.id}/position`).send({ position: 1 }).expect(404);
    await ctx.as('b').post('/study/sessions/open').send({ scope: deckId, mode: 'browse' }).expect(404); // not their deck
  });
});
