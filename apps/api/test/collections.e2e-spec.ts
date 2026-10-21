import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, exampleBatch, resetDb } from './helpers';

describe('collection recency and archive', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let deckA: string;
  let deckB: string;
  let subjectA: string;
  let subjectB: string;
  let questionA: string;
  let questionB: string;
  let userId: string;
  const batchA = () => ({ ...exampleBatch(), deck: { ...exampleBatch().deck, id: 'archive_a', title: 'Z 덱', subject: 'Z 과목' } });
  const batchB = () => ({ ...exampleBatch(), deck: { ...exampleBatch().deck, id: 'archive_b', title: 'A 덱', subject: 'A 과목' } });
  const review = (id: string, key: string) => ctx.api.post('/reviews').send({ questionId: id, rating: 3, idempotencyKey: key }).expect(201);

  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    deckA = (await ctx.api.post('/imports/commit').send({ batch: batchA() }).expect(200)).body.deckId;
    deckB = (await ctx.api.post('/imports/commit').send({ batch: batchB() }).expect(200)).body.deckId;
    userId = await ctx.userId('a');
    subjectA = (await ctx.prisma.subject.findUniqueOrThrow({ where: { userId_name: { userId, name: 'Z 과목' } } })).id;
    subjectB = (await ctx.prisma.subject.findUniqueOrThrow({ where: { userId_name: { userId, name: 'A 과목' } } })).id;
    questionA = (await ctx.prisma.question.findFirstOrThrow({ where: { userId, deckId: deckA } })).id;
    questionB = (await ctx.prisma.question.findFirstOrThrow({ where: { userId, deckId: deckB } })).id;
  });

  it('sorts decks and subjects by effective last review, ahead of names, edits and unreviewed items', async () => {
    const a = await review(questionA, 'recent-a');
    expect((await ctx.api.get('/decks').expect(200)).body.map((d: { id: string }) => d.id)).toEqual([deckA, deckB]);
    expect((await ctx.api.get('/subjects').expect(200)).body.map((s: { id: string }) => s.id)).toEqual([subjectA, subjectB]);
    const b = await review(questionB, 'recent-b');
    await ctx.api.patch(`/decks/${deckA}`).send({ title: '최근 수정한 덱' }).expect(200);
    let decks = (await ctx.api.get('/decks').expect(200)).body;
    expect(decks.map((d: { id: string }) => d.id)).toEqual([deckB, deckA]);
    expect(decks[0].lastReviewedAt).toBe(b.body.review.reviewedAt);
    expect((await ctx.api.get('/subjects').expect(200)).body[0].id).toBe(subjectB);
    await ctx.api.post(`/reviews/${b.body.review.id}/undo`).expect(200);
    decks = (await ctx.api.get('/decks').expect(200)).body;
    expect(decks.map((d: { id: string }) => d.id)).toEqual([deckA, deckB]);
    expect(decks[0].lastReviewedAt).toBe(a.body.review.reviewedAt);
    expect(decks[1].lastReviewedAt).toBeNull();
    expect((await ctx.api.get('/subjects').expect(200)).body[0].id).toBe(subjectA);
    // Resetting FSRS scheduling keeps historical recency; it is not an undo.
    await ctx.api.post(`/cards/${questionA}/reset`).expect(200);
    expect((await ctx.api.get('/decks').expect(200)).body[0]).toMatchObject({ id: deckA, lastReviewedAt: a.body.review.reviewedAt });
    expect((await ctx.api.get('/subjects').expect(200)).body[0]).toMatchObject({ id: subjectA, lastReviewedAt: a.body.review.reviewedAt });
  });

  it('archives and unarchives decks without changing cards, notes or review history', async () => {
    await review(questionA, 'archive-review');
    await ctx.api.put(`/questions/${questionA}/notes/2`).send({ body: '보존할 메모' }).expect(200);
    const card = await ctx.prisma.cardState.findUniqueOrThrow({ where: { questionId: questionA, userId } });
    const before = (await ctx.api.get('/decks').expect(200)).body.find((d: { id: string }) => d.id === deckA);
    const archived = await ctx.api.post(`/decks/${deckA}/archive`).expect(201);
    expect(archived.body.archivedAt).toBeTruthy();
    const again = await ctx.api.post(`/decks/${deckA}/archive`).expect(201);
    expect(again.body.archivedAt).toBe(archived.body.archivedAt);
    expect((await ctx.api.get('/decks').expect(200)).body.map((d: { id: string }) => d.id)).toEqual([deckB]);
    expect((await ctx.api.get('/decks?archived=true').expect(200)).body.map((d: { id: string }) => d.id)).toEqual([deckA]);
    expect((await ctx.api.get('/decks?includeArchived=true').expect(200)).body).toHaveLength(2);
    expect((await ctx.api.get('/decks?archived=false').expect(200)).body).toHaveLength(1);
    const queue = (await ctx.api.get('/study/queue?mode=cram').expect(200)).body;
    expect(queue.items.every((q: { deck: { id: string } }) => q.deck.id === deckB)).toBe(true);
    expect((await ctx.api.get(`/study/queue?deckId=${deckA}&mode=browse`).expect(200)).body.items).toHaveLength(8);
    expect(await ctx.prisma.cardState.findUniqueOrThrow({ where: { questionId: questionA, userId } })).toEqual(card);
    expect(await ctx.prisma.reviewLog.count({ where: { userId, questionId: questionA, undone: false } })).toBe(1);
    expect((await ctx.api.get(`/questions/${questionA}/notes`).expect(200)).body.notes[0].body).toBe('보존할 메모');
    expect((await ctx.api.get('/analytics/overview').expect(200)).body.window.reviews).toBe(1);
    await ctx.api.post(`/decks/${deckA}/unarchive`).expect(201);
    const restored = (await ctx.api.get('/decks').expect(200)).body[0];
    expect(restored.id).toBe(deckA);
    expect(restored.lastReviewedAt).toBe(before.lastReviewedAt);
    expect(restored.archivedAt).toBeNull();
    expect((await ctx.api.get('/study/queue?mode=cram').expect(200)).body.items).toHaveLength(16);
  });

  it('archives a subject without removing assignments or hiding questions shared with active subjects', async () => {
    await ctx.api.put(`/questions/${questionA}/subjects`).send({ names: ['A 과목'] }).expect(200);
    const count = await ctx.prisma.questionSubject.count({ where: { userId, deletedAt: null } });
    await ctx.api.post(`/subjects/${subjectA}/archive`).expect(201);
    expect((await ctx.api.get('/subjects').expect(200)).body.map((s: { id: string }) => s.id)).toEqual([subjectB]);
    expect((await ctx.api.get('/subjects?archived=true').expect(200)).body[0]).toMatchObject({ id: subjectA, questionCount: 8 });
    const queue = (await ctx.api.get('/study/queue?mode=cram').expect(200)).body.items;
    expect(queue).toHaveLength(9);
    expect(queue.filter((q: { deck: { id: string } }) => q.deck.id === deckA).map((q: { questionId: string }) => q.questionId)).toEqual([questionA]);
    expect(await ctx.prisma.questionSubject.count({ where: { userId, deletedAt: null } })).toBe(count);
    expect((await ctx.api.get('/subjects?includeArchived=true').expect(200)).body).toHaveLength(2);
    await ctx.api.post(`/subjects/${subjectA}/unarchive`).expect(201);
    expect((await ctx.api.get('/subjects').expect(200)).body).toHaveLength(2);
    expect((await ctx.api.get('/study/queue?mode=cram').expect(200)).body.items).toHaveLength(16);
  });

  it('keeps archive state on re-import and through backup/restore', async () => {
    await ctx.api.post(`/decks/${deckA}/archive`).expect(201);
    await ctx.api.post(`/subjects/${subjectA}/archive`).expect(201);
    await ctx.api.post('/imports/commit').send({ batch: batchA() }).expect(200);
    expect((await ctx.api.get('/decks?archived=true').expect(200)).body[0].id).toBe(deckA);
    expect((await ctx.api.get('/subjects?archived=true').expect(200)).body[0].id).toBe(subjectA);
    const backup = (await ctx.api.get('/exports/backup.json').expect(200)).body;
    await ctx.api.post('/exports/restore?force=true').send(backup).expect(200);
    const decks = (await ctx.api.get('/decks?archived=true').expect(200)).body;
    const subjects = (await ctx.api.get('/subjects?archived=true').expect(200)).body;
    expect(decks).toHaveLength(1);
    expect(decks[0]).toMatchObject({ slug: 'archive_a', archivedAt: expect.any(String) });
    expect(subjects).toHaveLength(1);
    expect(subjects[0]).toMatchObject({ name: 'Z 과목', questionCount: 8, archivedAt: expect.any(String) });
  });

  it('enforces tenant ownership and does not treat deletion as archiving', async () => {
    for (const path of [`/decks/${deckA}/archive`, `/decks/${deckA}/unarchive`, `/subjects/${subjectA}/archive`, `/subjects/${subjectA}/unarchive`]) {
      await ctx.as('b').post(path).expect(404);
    }
    expect((await ctx.as('b').get('/decks?archived=true').expect(200)).body).toEqual([]);
    expect((await ctx.as('b').get('/subjects?archived=true').expect(200)).body).toEqual([]);
    await ctx.api.delete(`/decks/${deckA}`).expect(200);
    await ctx.api.post(`/decks/${deckA}/archive`).expect(404);
    expect((await ctx.api.get('/decks?archived=true').expect(200)).body).toEqual([]);
    await ctx.api.get('/decks?archived=invalid').expect(400);
    await ctx.api.get('/subjects?archived=invalid').expect(400);
  });
});
