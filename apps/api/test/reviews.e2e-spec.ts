import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Rating, fsrs, generatorParameters, createEmptyCard } from 'ts-fsrs';
import { createApp, exampleBatch, resetDb } from './helpers';

describe('reviews / FSRS / undo / queue / notes', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let qid: string;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await request(ctx.server).post('/imports/commit').send({ batch: exampleBatch() }).expect(200);
    qid = (await ctx.prisma.question.findFirstOrThrow({ where: { externalId: 'net-q001' } })).id;
  });

  it('each rating yields the library-defined due date and persisted state', async () => {
    for (const [rating, label] of [[1, 'again'], [2, 'hard'], [3, 'good'], [4, 'easy']] as const) {
      await resetDb(ctx.prisma);
      await request(ctx.server).post('/imports/commit').send({ batch: exampleBatch() }).expect(200);
      const id = (await ctx.prisma.question.findFirstOrThrow({ where: { externalId: 'net-q001' } })).id;
      const queue = await request(ctx.server).get(`/study/queue?deckId=computer_networks_01`).expect(200);
      const item = queue.body.items.find((i: { questionId: string }) => i.questionId === id);
      const res = await request(ctx.server).post('/reviews').send({ questionId: id, rating, idempotencyKey: `k-${label}`, isCorrect: true, elapsedMs: 1200 }).expect(201);
      const now = new Date(res.body.review.reviewedAt);
      const ref = fsrs(generatorParameters({ request_retention: 0.9, maximum_interval: 36500, enable_fuzz: false })).next(createEmptyCard(now), now, rating as Rating.Again);
      expect(new Date(res.body.card.dueAt).toISOString()).toBe(ref.card.due.toISOString());
      expect(res.body.card.reps).toBe(1);
      expect(res.body.reviewRound).toBe(1);
      expect(res.body.review.schedulerVersion).toContain('ts-fsrs');
      // preview shown before rating matches what was scheduled (same minute)
      expect(Math.abs(new Date(item.preview[label].due).getTime() - ref.card.due.getTime())).toBeLessThan(5 * 60_000);
    }
  });

  it('idempotent retries do not duplicate and the version guards races', async () => {
    const body = { questionId: qid, rating: 3, idempotencyKey: 'k-dup-1', expectedVersion: 0 };
    const [a, b] = await Promise.all([request(ctx.server).post('/reviews').send(body), request(ctx.server).post('/reviews').send(body)]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    expect(await ctx.prisma.reviewLog.count({ where: { questionId: qid } })).toBe(1);
    expect([a.body.replayed, b.body.replayed].filter(Boolean)).toHaveLength(1);
    const c = await ctx.prisma.cardState.findUniqueOrThrow({ where: { questionId: qid } });
    expect(c.version).toBe(1);
    // stale version → 409, nothing recorded
    const stale = await request(ctx.server).post('/reviews').send({ questionId: qid, rating: 3, idempotencyKey: 'k-stale', expectedVersion: 0 }).expect(409);
    expect(stale.body.error).toBe('CONFLICT');
    expect(await ctx.prisma.reviewLog.count({ where: { questionId: qid } })).toBe(1);
  });

  it('undo restores the exact previous card and only the latest review can be undone', async () => {
    const before = await ctx.prisma.cardState.findUniqueOrThrow({ where: { questionId: qid } });
    const r1 = await request(ctx.server).post('/reviews').send({ questionId: qid, rating: 3, idempotencyKey: 'k-u1' }).expect(201);
    const r2 = await request(ctx.server).post('/reviews').send({ questionId: qid, rating: 4, idempotencyKey: 'k-u2' }).expect(201);
    await request(ctx.server).post(`/reviews/${r1.body.review.id}/undo`).expect(409);
    const undo = await request(ctx.server).post(`/reviews/${r2.body.review.id}/undo`).expect(200);
    expect(undo.body.card.stateJson).toEqual(r1.body.card.stateJson);
    expect(undo.body.card.reps).toBe(1);
    await request(ctx.server).post(`/reviews/${r2.body.review.id}/undo`).expect(409);
    const undo1 = await request(ctx.server).post(`/reviews/${r1.body.review.id}/undo`).expect(200);
    expect(undo1.body.card.stateJson).toEqual(before.stateJson);
    expect(undo1.body.card.status).toBe('NEW');
    expect(await ctx.prisma.reviewLog.count({ where: { questionId: qid, undone: false } })).toBe(0);
  });

  it('queue respects daily limits, suspend, bury, and flagged/mistakes modes', async () => {
    await request(ctx.server).patch('/settings').send({ newCardsPerDay: 3 }).expect(200);
    const q1 = await request(ctx.server).get('/study/queue?deckId=computer_networks_01').expect(200);
    expect(q1.body.counts.queued).toBe(3);
    expect(q1.body.items.every((i: { card: { status: string } }) => i.card.status === 'NEW')).toBe(true);
    // suspend one → excluded
    await request(ctx.server).post(`/cards/${qid}/suspend`).expect(200);
    const q2 = await request(ctx.server).get('/study/queue?deckId=computer_networks_01').expect(200);
    expect(q2.body.items.some((i: { questionId: string }) => i.questionId === qid)).toBe(false);
    await request(ctx.server).post(`/cards/${qid}/resume`).expect(200);
    // flagged mode
    await request(ctx.server).post(`/cards/${qid}/flag`).expect(200);
    const fl = await request(ctx.server).get('/study/queue?deckId=computer_networks_01&mode=flagged').expect(200);
    expect(fl.body.items.map((i: { questionId: string }) => i.questionId)).toEqual([qid]);
    // mistakes mode after an incorrect review
    await request(ctx.server).post('/reviews').send({ questionId: qid, rating: 1, idempotencyKey: 'k-wrong', isCorrect: false }).expect(201);
    const mis = await request(ctx.server).get('/study/queue?deckId=computer_networks_01&mode=mistakes').expect(200);
    expect(mis.body.items.map((i: { questionId: string }) => i.questionId)).toContain(qid);
    // cross-deck + subject scope
    const all = await request(ctx.server).get('/study/queue?subject=Computer%20Networks&mode=cram').expect(200);
    expect(all.body.counts.total).toBe(8);
    // bury
    await request(ctx.server).post(`/cards/${qid}/bury`).expect(200);
    const buried = await request(ctx.server).get('/study/queue?deckId=computer_networks_01&mode=cram').expect(200);
    expect(buried.body.counts.buried).toBe(1);
  });

  it('notes: one per review round, linked to the review of that round, surviving undo', async () => {
    const n0 = await request(ctx.server).get(`/questions/${qid}/notes`).expect(200);
    expect(n0.body.currentRound).toBe(1);
    await request(ctx.server).put(`/questions/${qid}/notes/2`).send({ body: 'too early' }).expect(400);
    await request(ctx.server).put(`/questions/${qid}/notes/1`).send({ body: '1회차: SYN 먼저' }).expect(200);
    const r1 = await request(ctx.server).post('/reviews').send({ questionId: qid, rating: 3, idempotencyKey: 'k-n1' }).expect(201);
    const n1 = await request(ctx.server).get(`/questions/${qid}/notes`).expect(200);
    expect(n1.body.currentRound).toBe(2);
    expect(n1.body.notes).toHaveLength(1);
    expect(n1.body.notes[0].review.id).toBe(r1.body.review.id);
    await request(ctx.server).put(`/questions/${qid}/notes/2`).send({ body: '2회차 메모' }).expect(200);
    // same round again → updates, not duplicates
    await request(ctx.server).put(`/questions/${qid}/notes/2`).send({ body: '2회차 메모 (수정)' }).expect(200);
    const n2 = await request(ctx.server).get(`/questions/${qid}/notes`).expect(200);
    expect(n2.body.notes.map((n: { reviewRound: number; body: string }) => [n.reviewRound, n.body])).toEqual([[1, '1회차: SYN 먼저'], [2, '2회차 메모 (수정)']]);
    // undo keeps both notes; round 1 becomes current again? No: undo of r1 makes round 1 current, note 2 stays stored
    await request(ctx.server).post(`/reviews/${r1.body.review.id}/undo`).expect(200);
    const n3 = await request(ctx.server).get(`/questions/${qid}/notes`).expect(200);
    expect(n3.body.currentRound).toBe(1);
    expect(n3.body.notes).toHaveLength(2);
    expect(n3.body.notes[0].review).toBeNull();
    // deck-level listing
    const deckNotes = await request(ctx.server).get('/decks/computer_networks_01/notes').expect(200);
    expect(deckNotes.body).toHaveLength(2);
    // soft delete
    await request(ctx.server).delete(`/questions/${qid}/notes/2`).expect(200);
    const n4 = await request(ctx.server).get(`/questions/${qid}/notes`).expect(200);
    expect(n4.body.notes).toHaveLength(1);
  });

  it('grading endpoint is authoritative and public queue never leaks answers', async () => {
    const queue = await request(ctx.server).get('/study/queue?deckId=computer_networks_01&mode=cram').expect(200);
    const json = JSON.stringify(queue.body.items.map((i: { question: unknown }) => i.question));
    expect(json).not.toContain('acceptedAnswers');
    expect(json).not.toContain('modelAnswer');
    expect(json).not.toContain('"choiceId"');
    expect(json).not.toContain('orderedIds');
    const g = await request(ctx.server).post(`/questions/${qid}/grade`).send({ answerPayload: { type: 'single_choice', choiceId: 'a' } }).expect(201);
    expect(g.body.grade.isCorrect).toBe(true);
    expect(g.body.answerKey.answer.choiceId).toBe('a');
    expect(g.body.explanation.summary).toContain('SYN');
  });

  it('subjects are tag-like: a question can belong to several', async () => {
    await request(ctx.server).put(`/questions/${qid}/subjects`).send({ names: ['Computer Networks', 'TCP/IP', '중간고사'] }).expect(200);
    const s = await request(ctx.server).get(`/questions/${qid}/subjects`).expect(200);
    expect(s.body.map((x: { name: string }) => x.name).sort()).toEqual(['Computer Networks', 'TCP/IP', '중간고사']);
    const list = await request(ctx.server).get('/subjects').expect(200);
    expect(list.body.find((x: { name: string }) => x.name === 'TCP/IP').questionCount).toBe(1);
    const byTcp = await request(ctx.server).get('/study/queue?subject=TCP%2FIP&mode=cram').expect(200);
    expect(byTcp.body.counts.total).toBe(1);
    // removing manual subject keeps deck-sourced one
    await request(ctx.server).put(`/questions/${qid}/subjects`).send({ names: [] }).expect(200);
    const s2 = await request(ctx.server).get(`/questions/${qid}/subjects`).expect(200);
    expect(s2.body.map((x: { name: string }) => x.name)).toEqual(['Computer Networks']);
  });
});
