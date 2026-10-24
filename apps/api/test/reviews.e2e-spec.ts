import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Rating, fsrs, generatorParameters, createEmptyCard } from 'ts-fsrs';
import { Prisma } from '../src/generated/prisma/client';
import { createApp, exampleBatch, resetDb } from './helpers';

describe('reviews / FSRS / undo / queue / notes', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let qid: string;
  let deckId: string;
  let uid: string;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    deckId = (await ctx.api.post('/imports/commit').send({ batch: exampleBatch() }).expect(200)).body.deckId;
    uid = await ctx.userId('a');
    qid = (await ctx.prisma.question.findFirstOrThrow({ where: { userId: uid, externalId: 'net-q001' } })).id;
  });

  it('each rating yields the library-defined due date and persisted state', async () => {
    for (const [rating, label] of [[1, 'again'], [2, 'hard'], [3, 'good'], [4, 'easy']] as const) {
      await resetDb(ctx.prisma);
      const did = (await ctx.api.post('/imports/commit').send({ batch: exampleBatch() }).expect(200)).body.deckId;
      const id = (await ctx.prisma.question.findFirstOrThrow({ where: { userId: await ctx.userId('a'), externalId: 'net-q001' } })).id;
      const queue = await ctx.api.get(`/study/queue?deckId=${did}`).expect(200);
      const item = queue.body.items.find((i: { questionId: string }) => i.questionId === id);
      const res = await ctx.api.post('/reviews').send({ questionId: id, rating, idempotencyKey: `k-${label}`, isCorrect: true, elapsedMs: 1200 }).expect(201);
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
    const [a, b] = await Promise.all([ctx.api.post('/reviews').send(body), ctx.api.post('/reviews').send(body)]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    expect(await ctx.prisma.reviewLog.count({ where: { userId: uid, questionId: qid } })).toBe(1);
    expect([a.body.replayed, b.body.replayed].filter(Boolean)).toHaveLength(1);
    const c = await ctx.prisma.cardState.findUniqueOrThrow({ where: { questionId: qid, userId: uid } });
    expect(c.version).toBe(1);
    // stale version → 409, nothing recorded
    const stale = await ctx.api.post('/reviews').send({ questionId: qid, rating: 3, idempotencyKey: 'k-stale', expectedVersion: 0 }).expect(409);
    expect(stale.body.error).toBe('CONFLICT');
    expect(await ctx.prisma.reviewLog.count({ where: { userId: uid, questionId: qid } })).toBe(1);
  });

  it('undo restores the exact previous card and only the latest review can be undone', async () => {
    const before = await ctx.prisma.cardState.findUniqueOrThrow({ where: { questionId: qid, userId: uid } });
    const r1 = await ctx.api.post('/reviews').send({ questionId: qid, rating: 3, idempotencyKey: 'k-u1' }).expect(201);
    const r2 = await ctx.api.post('/reviews').send({ questionId: qid, rating: 4, idempotencyKey: 'k-u2' }).expect(201);
    await ctx.api.post(`/reviews/${r1.body.review.id}/undo`).expect(409);
    const undo = await ctx.api.post(`/reviews/${r2.body.review.id}/undo`).expect(200);
    expect(undo.body.card.stateJson).toEqual(r1.body.card.stateJson);
    expect(undo.body.card.reps).toBe(1);
    await ctx.api.post(`/reviews/${r2.body.review.id}/undo`).expect(409);
    const undo1 = await ctx.api.post(`/reviews/${r1.body.review.id}/undo`).expect(200);
    expect(undo1.body.card.stateJson).toEqual(before.stateJson);
    expect(undo1.body.card.status).toBe('NEW');
    expect(await ctx.prisma.reviewLog.count({ where: { userId: uid, questionId: qid, undone: false } })).toBe(0);
  });

  it('previous responses: effective reviews and practice answers, newest first, re-graded, with empty fallbacks', async () => {
    const choice = (choiceId: string) => ({ type: 'single_choice', choiceId });
    const r1 = await ctx.api.post('/reviews').send({ questionId: qid, rating: 1, idempotencyKey: 'k-p1', answerPayload: choice('b'), isCorrect: false }).expect(201);
    await ctx.api.post('/reviews').send({ questionId: qid, rating: 3, idempotencyKey: 'k-p2', answerPayload: choice('a'), isCorrect: true }).expect(201);
    const r3 = await ctx.api.post('/reviews').send({ questionId: qid, rating: 2, idempotencyKey: 'k-p3', answerPayload: choice('c') }).expect(201);
    await ctx.api.post(`/reviews/${r3.body.review.id}/undo`).expect(200);
    await ctx.api.post('/study/practice').send({ questionId: qid, answerPayload: choice('a') }).expect(201);
    await ctx.api.post('/study/practice').send({ questionId: qid, answerPayload: null }).expect(201);
    // a record from before answers were stored
    await ctx.prisma.reviewLog.update({ where: { id: r1.body.review.id, userId: uid }, data: { answerPayloadJson: Prisma.DbNull } });

    const res = await ctx.api.get(`/reviews/responses/${qid}`).expect(200);
    const items = res.body.items as { kind: string; reviewRound: number | null; rating: number | null; revealedBeforeAnswer: boolean; answerPayload: { choiceId: string } | null; grade: { isCorrect: boolean } | null }[];
    expect(items.map((i) => i.kind)).toEqual(['practice', 'practice', 'review', 'review']);
    const reviews = items.filter((i) => i.kind === 'review');
    expect(reviews.map((i) => i.reviewRound)).toEqual([2, 1]); // the undone round is gone
    expect(reviews[0]!.answerPayload?.choiceId).toBe('a');
    expect(reviews[0]!.grade?.isCorrect).toBe(true);
    expect(reviews[1]!.answerPayload).toBeNull();
    expect(reviews[1]!.grade).toBeNull();
    expect(items[0]!.revealedBeforeAnswer).toBe(true); // practice reveal without an answer
    expect(items[1]!.grade?.isCorrect).toBe(true);
    // scoped to the owner
    await ctx.as('b').get(`/reviews/responses/${qid}`).expect(404);
  });

  it('queue respects daily limits, suspend, bury, and flagged/mistakes modes', async () => {
    await ctx.api.patch('/settings').send({ newCardsPerDay: 3 }).expect(200);
    const q1 = await ctx.api.get(`/study/queue?deckId=${deckId}`).expect(200);
    expect(q1.body.counts.queued).toBe(3);
    expect(q1.body.items.every((i: { card: { status: string } }) => i.card.status === 'NEW')).toBe(true);
    // suspend one → excluded
    await ctx.api.post(`/cards/${qid}/suspend`).expect(200);
    const q2 = await ctx.api.get(`/study/queue?deckId=${deckId}`).expect(200);
    expect(q2.body.items.some((i: { questionId: string }) => i.questionId === qid)).toBe(false);
    // browse ignores the daily limit and suspension, keeps deck order, and has no answer keys or previews
    const br = await ctx.api.get(`/study/queue?deckId=${deckId}&mode=browse`).expect(200);
    expect(br.body.counts.queued).toBe(br.body.counts.total);
    expect(br.body.counts.queued).toBeGreaterThan(3);
    expect(br.body.items[0].questionId).toBe(qid);
    expect(br.body.items.every((i: { preview: unknown }) => i.preview === null)).toBe(true);
    expect(JSON.stringify(br.body.items.map((i: { question: unknown }) => i.question))).not.toContain('"choiceId"');
    await ctx.api.post('/study/sessions').send({ scope: deckId, mode: 'browse' }).expect(400);
    await ctx.api.post(`/cards/${qid}/resume`).expect(200);
    // flagged mode
    await ctx.api.post(`/cards/${qid}/flag`).expect(200);
    const fl = await ctx.api.get(`/study/queue?deckId=${deckId}&mode=flagged`).expect(200);
    expect(fl.body.items.map((i: { questionId: string }) => i.questionId)).toEqual([qid]);
    // mistakes mode after an incorrect review
    await ctx.api.post('/reviews').send({ questionId: qid, rating: 1, idempotencyKey: 'k-wrong', isCorrect: false }).expect(201);
    const mis = await ctx.api.get(`/study/queue?deckId=${deckId}&mode=mistakes`).expect(200);
    expect(mis.body.items.map((i: { questionId: string }) => i.questionId)).toContain(qid);
    // cross-deck + subject scope
    const all = await ctx.api.get('/study/queue?subject=Computer%20Networks&mode=cram').expect(200);
    expect(all.body.counts.total).toBe(8);
    // bury
    await ctx.api.post(`/cards/${qid}/bury`).expect(200);
    const buried = await ctx.api.get(`/study/queue?deckId=${deckId}&mode=cram`).expect(200);
    expect(buried.body.counts.buried).toBe(1);
  });

  it('notes: one per review round, linked to the review of that round, surviving undo', async () => {
    const n0 = await ctx.api.get(`/questions/${qid}/notes`).expect(200);
    expect(n0.body.currentRound).toBe(1);
    await ctx.api.put(`/questions/${qid}/notes/2`).send({ body: 'too early' }).expect(400);
    await ctx.api.put(`/questions/${qid}/notes/1`).send({ body: '1회차: SYN 먼저' }).expect(200);
    const r1 = await ctx.api.post('/reviews').send({ questionId: qid, rating: 3, idempotencyKey: 'k-n1' }).expect(201);
    const n1 = await ctx.api.get(`/questions/${qid}/notes`).expect(200);
    expect(n1.body.currentRound).toBe(2);
    expect(n1.body.notes).toHaveLength(1);
    expect(n1.body.notes[0].review.id).toBe(r1.body.review.id);
    await ctx.api.put(`/questions/${qid}/notes/2`).send({ body: '2회차 메모' }).expect(200);
    // same round again → updates, not duplicates
    await ctx.api.put(`/questions/${qid}/notes/2`).send({ body: '2회차 메모 (수정)' }).expect(200);
    const n2 = await ctx.api.get(`/questions/${qid}/notes`).expect(200);
    expect(n2.body.notes.map((n: { reviewRound: number; body: string }) => [n.reviewRound, n.body])).toEqual([[1, '1회차: SYN 먼저'], [2, '2회차 메모 (수정)']]);
    // undo keeps both notes; round 1 becomes current again? No: undo of r1 makes round 1 current, note 2 stays stored
    await ctx.api.post(`/reviews/${r1.body.review.id}/undo`).expect(200);
    const n3 = await ctx.api.get(`/questions/${qid}/notes`).expect(200);
    expect(n3.body.currentRound).toBe(1);
    expect(n3.body.notes).toHaveLength(2);
    expect(n3.body.notes[0].review).toBeNull();
    // deck-level listing
    const deckNotes = await ctx.api.get(`/decks/${deckId}/notes`).expect(200);
    expect(deckNotes.body).toHaveLength(2);
    // soft delete
    await ctx.api.delete(`/questions/${qid}/notes/2`).expect(200);
    const n4 = await ctx.api.get(`/questions/${qid}/notes`).expect(200);
    expect(n4.body.notes).toHaveLength(1);
  });

  it('grading endpoint is authoritative and public queue never leaks answers', async () => {
    const queue = await ctx.api.get(`/study/queue?deckId=${deckId}&mode=cram`).expect(200);
    const json = JSON.stringify(queue.body.items.map((i: { question: unknown }) => i.question));
    expect(json).not.toContain('acceptedAnswers');
    expect(json).not.toContain('modelAnswer');
    expect(json).not.toContain('"choiceId"');
    expect(json).not.toContain('orderedIds');
    const g = await ctx.api.post(`/questions/${qid}/grade`).send({ answerPayload: { type: 'single_choice', choiceId: 'a' } }).expect(201);
    expect(g.body.grade.isCorrect).toBe(true);
    expect(g.body.answerKey.answer.choiceId).toBe('a');
    expect(g.body.explanation.summary).toContain('SYN');
  });

  it('subjects are tag-like: a question can belong to several', async () => {
    await ctx.api.put(`/questions/${qid}/subjects`).send({ names: ['Computer Networks', 'TCP/IP', '중간고사'] }).expect(200);
    const s = await ctx.api.get(`/questions/${qid}/subjects`).expect(200);
    expect(s.body.map((x: { name: string }) => x.name).sort()).toEqual(['Computer Networks', 'TCP/IP', '중간고사']);
    const list = await ctx.api.get('/subjects').expect(200);
    expect(list.body.find((x: { name: string }) => x.name === 'TCP/IP').questionCount).toBe(1);
    const byTcp = await ctx.api.get('/study/queue?subject=TCP%2FIP&mode=cram').expect(200);
    expect(byTcp.body.counts.total).toBe(1);
    // removing manual subject keeps deck-sourced one
    await ctx.api.put(`/questions/${qid}/subjects`).send({ names: [] }).expect(200);
    const s2 = await ctx.api.get(`/questions/${qid}/subjects`).expect(200);
    expect(s2.body.map((x: { name: string }) => x.name)).toEqual(['Computer Networks']);
  });
});

describe('deck subject reassignment', () => {
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

  it('replacing the deck subject moves all deck-sourced links to an existing subject, keeps manual ones', async () => {
    await ctx.api.post('/subjects').send({ name: 'Networking 101' }).expect(201);
    const q = await ctx.prisma.question.findFirstOrThrow({ where: { userId: uid, externalId: 'net-q001' } });
    await ctx.api.put(`/questions/${q.id}/subjects`).send({ names: ['Computer Networks', 'Manual Tag'] }).expect(200);
    const r = await ctx.api.patch(`/decks/${deckId}`).send({ subject: 'Networking 101' }).expect(200);
    expect(r.body.subject).toBe('Networking 101');
    const subjects = (await ctx.api.get('/subjects').expect(200)).body as { name: string; questionCount: number }[];
    const by = Object.fromEntries(subjects.map((s) => [s.name, s.questionCount]));
    expect(by['Networking 101']).toBe(8);
    expect(by['Computer Networks']).toBe(0);
    expect(by['Manual Tag']).toBe(1);
    const mine = await ctx.api.get(`/questions/${q.id}/subjects`).expect(200);
    expect(mine.body.map((s: { name: string; source: string }) => `${s.name}:${s.source}`).sort()).toEqual(['Manual Tag:manual', 'Networking 101:deck']);
    // decks grouped by subject follows
    const grouped = await ctx.api.get('/decks/by-subject').expect(200);
    expect(grouped.body[0].subject).toBe('Networking 101');
    // and the admin path does the same relink
    await ctx.api.patch(`/admin/decks/${deckId}`).send({ subject: 'Computer Networks' }).expect(200);
    const again = Object.fromEntries(((await ctx.api.get('/subjects').expect(200)).body as { name: string; questionCount: number }[]).map((s) => [s.name, s.questionCount]));
    expect(again['Computer Networks']).toBe(8);
    expect(again['Networking 101']).toBe(0);
  });

  it('adding a subject to a whole deck keeps the primary subject', async () => {
    const r = await ctx.api.post(`/decks/${deckId}/subjects`).send({ name: '중간고사 범위' }).expect(201);
    expect(r.body.assigned).toBe(8);
    const by = Object.fromEntries(((await ctx.api.get('/subjects').expect(200)).body as { name: string; questionCount: number }[]).map((s) => [s.name, s.questionCount]));
    expect(by['중간고사 범위']).toBe(8);
    expect(by['Computer Networks']).toBe(8);
    await ctx.api.post(`/decks/${deckId}/subjects`).send({ name: '   ' }).expect(400);
  });
});
