import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, exampleBatch, resetDb } from './helpers';

describe('shares', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let aDeck: string;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    aDeck = (await ctx.api.post('/imports/commit').send({ batch: exampleBatch() }).expect(200)).body.deckId;
    await ctx.as('b').get('/auth/me').expect(200);
  });

  const qid = async (who: 'a' | 'b' | 'c', externalId: string, deckId?: string) =>
    (await ctx.prisma.question.findFirstOrThrow({ where: { userId: await ctx.userId(who), externalId, ...(deckId ? { deckId } : {}) } })).id;
  const shareTo = async (email: string, body: Record<string, unknown> = { kind: 'deck', deckId: aDeck }) => {
    await ctx.api.post('/shares').send({ ...body, emails: [email] }).expect(201);
    const row = await ctx.prisma.share.findFirstOrThrow({ where: { userId: await ctx.userId('a'), recipientEmail: email }, orderBy: { createdAt: 'desc' } });
    return row.id;
  };

  it('copies a deck with fresh learning state: no reviews, notes, flags or suspensions travel', async () => {
    const q1 = await qid('a', 'net-q001');
    await ctx.api.post('/reviews').send({ questionId: q1, rating: 3, idempotencyKey: 'a-r1' }).expect(201);
    await ctx.api.put(`/questions/${q1}/notes/1`).send({ body: 'my note' }).expect(200);
    await ctx.api.post(`/cards/${q1}/flag`).expect(200);
    await ctx.api.post('/subjects/bulk-assign').send({ questionIds: [q1], name: '시험범위' }).expect(200);

    const sent = await ctx.api.post('/shares').send({ kind: 'deck', deckId: aDeck, emails: ['B@Test.local', 'nobody@nowhere.dev'], message: '같이 공부해요' }).expect(201);
    expect(sent.body).toMatchObject({ sent: 2, recipients: ['b@test.local', 'nobody@nowhere.dev'], deckCount: 1, questionCount: 8, title: '컴퓨터네트워크 핵심 복습' });

    const b = ctx.as('b');
    expect((await b.get('/shares/received/count').expect(200)).body.pending).toBe(1);
    const [item] = (await b.get('/shares/received').expect(200)).body;
    expect(item).toMatchObject({ status: 'pending', kind: 'deck', message: '같이 공부해요', sender: { email: 'a@test.local' } });
    const detail = (await b.get(`/shares/received/${item.id}`).expect(200)).body;
    expect(detail.snapshot.decks[0].questions).toHaveLength(8);
    expect(JSON.stringify(detail.snapshot)).not.toContain('my note');
    expect(detail.suggestions.decks).toEqual({});

    const res = await b.post(`/shares/received/${item.id}/accept`).send({}).expect(200);
    expect(res.body.decks).toEqual([expect.objectContaining({ isNew: true, created: 8, title: '컴퓨터네트워크 핵심 복습' })]);
    const bid = await ctx.userId('b');
    const bDeck = res.body.decks[0].id as string;
    expect(await ctx.prisma.cardState.count({ where: { userId: bid, status: 'NEW', flagged: false, suspended: false, reps: 0 } })).toBe(8);
    expect(await ctx.prisma.reviewLog.count({ where: { userId: bid } })).toBe(0);
    expect(await ctx.prisma.questionNote.count({ where: { userId: bid } })).toBe(0);
    const bq1 = await qid('b', 'net-q001', bDeck);
    expect((await ctx.prisma.question.findFirstOrThrow({ where: { id: bq1, userId: bid } })).originId).toBe(q1);
    expect((await b.get(`/questions/${bq1}/subjects`).expect(200)).body.map((s: { name: string }) => s.name).sort()).toEqual(['Computer Networks', '시험범위']);
    // A's own copy is untouched; the share is now accepted on both sides
    expect(await ctx.prisma.reviewLog.count({ where: { userId: await ctx.userId('a') } })).toBe(1);
    const aSent = (await ctx.api.get('/shares/sent').expect(200)).body as { recipientEmail: string; status: string }[];
    expect(aSent.find((s) => s.recipientEmail === 'b@test.local')?.status).toBe('accepted');
    expect(aSent.find((s) => s.recipientEmail === 'nobody@nowhere.dev')?.status).toBe('pending');
    await b.post(`/shares/received/${item.id}/accept`).send({}).expect(409);
  });

  it('refuses self-shares and bad addresses; only the recipient can see or answer a share', async () => {
    await ctx.api.post('/shares').send({ kind: 'deck', deckId: aDeck, emails: ['a@test.local'] }).expect(400);
    await ctx.api.post('/shares').send({ kind: 'deck', deckId: aDeck, emails: ['not-an-email'] }).expect(400);
    await ctx.as('b').post('/shares').send({ kind: 'deck', deckId: aDeck, emails: ['c@test.local'] }).expect(404);
    const id = await shareTo('b@test.local');
    for (const who of ['a', 'c'] as const) {
      await ctx.as(who).get(`/shares/received/${id}`).expect(404);
      await ctx.as(who).post(`/shares/received/${id}/accept`).send({}).expect(404);
      await ctx.as(who).post(`/shares/received/${id}/decline`).expect(404);
    }
    await ctx.as('b').post(`/shares/${id}/cancel`).expect(404);
    expect((await ctx.as('c').get('/shares/received').expect(200)).body).toEqual([]);
  });

  it('a share to an address without an account waits until that person signs in', async () => {
    await shareTo('c@test.local');
    expect(await ctx.prisma.user.count({ where: { email: 'c@test.local' } })).toBe(0);
    expect((await ctx.as('c').get('/shares/received/count').expect(200)).body.pending).toBe(1);
  });

  it('merging a re-share matches questions by origin, never by externalId', async () => {
    const first = await shareTo('b@test.local');
    const b = ctx.as('b');
    const bDeck = (await b.post(`/shares/received/${first}/accept`).send({}).expect(200)).body.decks[0].id as string;
    // B also owns an unrelated deck whose questions happen to use the same externalIds
    const own = (await b.post('/imports/commit').send({ batch: { ...exampleBatch(), deck: { ...exampleBatch().deck, id: 'b_own' } } }).expect(200)).body.deckId as string;

    // A edits one question's wording and re-shares; B's earlier copy is suggested as the merge target
    const batch = exampleBatch();
    batch.questions[0]!.prompt = `${batch.questions[0]!.prompt} (개정)`;
    await ctx.api.post('/imports/commit').send({ batch }).expect(200);
    const second = await shareTo('b@test.local');
    const detail = (await b.get(`/shares/received/${second}`).expect(200)).body;
    const originId = detail.snapshot.decks[0].originId as string;
    expect(originId).toBe(aDeck);
    expect(detail.suggestions.decks[originId]).toMatchObject({ id: bDeck });

    const merged = await b.post(`/shares/received/${second}/accept`).send({ targets: [{ group: '0', mode: 'existing', deckId: bDeck, strategy: 'upsert' }] }).expect(200);
    expect(merged.body.decks[0]).toMatchObject({ id: bDeck, isNew: false, created: 0, updated: 1, unchanged: 7 });
    expect(((await ctx.prisma.question.findFirstOrThrow({ where: { userId: await ctx.userId('b'), deckId: bDeck, externalId: 'net-q001' } })).payloadJson as { prompt: string }).prompt).toContain('(개정)');

    // Into the unrelated deck: nothing matches by origin, so all 8 are added under fresh ids
    const third = await shareTo('b@test.local');
    const into = await b.post(`/shares/received/${third}/accept`).send({ targets: [{ group: '0', mode: 'existing', deckId: own, strategy: 'upsert' }] }).expect(200);
    expect(into.body.decks[0]).toMatchObject({ created: 8, updated: 0 });
    const exts = (await ctx.prisma.question.findMany({ where: { userId: await ctx.userId('b'), deckId: own }, select: { externalId: true, payloadJson: true } }));
    expect(exts).toHaveLength(16);
    expect(exts.map((e) => e.externalId)).toContain('net-q001-2');
    for (const e of exts) expect((e.payloadJson as { id: string }).id).toBe(e.externalId);
    expect(((await ctx.prisma.question.findFirstOrThrow({ where: { userId: await ctx.userId('b'), deckId: own, externalId: 'net-q001' } })).payloadJson as { prompt: string }).prompt).not.toContain('(개정)');
  });

  it('a subject share can be merged into one deck with a renamed subject', async () => {
    const ext = (await ctx.api.post('/imports/commit').send({ batch: exampleBatch('example-extended-batch') }).expect(200)).body.deckId as string;
    const ids = [await qid('a', 'net-q001'), await qid('a', 'net-q002'), ...(await ctx.prisma.question.findMany({ where: { userId: await ctx.userId('a'), deckId: ext }, take: 3 })).map((q) => q.id)];
    await ctx.api.post('/subjects/bulk-assign').send({ questionIds: ids, name: '중간고사' }).expect(200);
    const subjectId = (await ctx.prisma.subject.findFirstOrThrow({ where: { userId: await ctx.userId('a'), name: '중간고사' } })).id;
    const id = await shareTo('b@test.local', { kind: 'subject', subjectId });
    const b = ctx.as('b');
    const detail = (await b.get(`/shares/received/${id}`).expect(200)).body;
    expect(detail).toMatchObject({ kind: 'subject', deckCount: 2, questionCount: 5, title: '중간고사' });

    const res = await b.post(`/shares/received/${id}/accept`).send({ layout: 'merge', targets: [{ group: '*', mode: 'new', title: '중간 대비' }], subjectMap: { '중간고사': '미드텀', 'Operating Systems': '' } }).expect(200);
    expect(res.body.decks).toEqual([expect.objectContaining({ isNew: true, created: 5, title: '중간 대비' })]);
    const bid = await ctx.userId('b');
    const deck = await ctx.prisma.deck.findFirstOrThrow({ where: { userId: bid, id: res.body.decks[0].id } });
    expect(deck.subject).toBe('미드텀');
    const names = (await b.get('/subjects').expect(200)).body.map((s: { name: string }) => s.name).sort();
    expect(names).toEqual(['Computer Networks', '미드텀']); // "Operating Systems" was dropped by the map
  });

  it('question shares honour exclusions; keep layout makes one deck per source deck', async () => {
    const ids = [await qid('a', 'net-q001'), await qid('a', 'net-q002'), await qid('a', 'net-q003')];
    const id = await shareTo('b@test.local', { kind: 'questions', questionIds: ids });
    const b = ctx.as('b');
    const detail = (await b.get(`/shares/received/${id}`).expect(200)).body;
    expect(detail.title).toBe('컴퓨터네트워크 핵심 복습 · 문항 3개');
    const res = await b.post(`/shares/received/${id}/accept`).send({ exclude: ['0/net-q002'], extraSubjects: false }).expect(200);
    expect(res.body.decks[0]).toMatchObject({ created: 2 });
    await b.post(`/shares/received/${id}/accept`).send({}).expect(409);
  });

  it('cancel hides a share from the recipient; decline and expiry stop acceptance', async () => {
    const b = ctx.as('b');
    const canceled = await shareTo('b@test.local');
    await ctx.api.post(`/shares/${canceled}/cancel`).expect(200);
    await ctx.api.post(`/shares/${canceled}/cancel`).expect(409);
    await b.get(`/shares/received/${canceled}`).expect(404);

    const declined = await shareTo('b@test.local');
    await b.post(`/shares/received/${declined}/decline`).expect(200);
    await b.post(`/shares/received/${declined}/accept`).send({}).expect(409);
    expect((await ctx.api.get('/shares/sent').expect(200)).body.find((s: { id: string }) => s.id === declined).status).toBe('declined');

    const expired = await shareTo('b@test.local');
    await ctx.prisma.share.update({ where: { id: expired, userId: await ctx.userId('a') }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await b.get('/shares/received').expect(200)).body.find((s: { id: string }) => s.id === expired).status).toBe('expired');
    expect((await b.get('/shares/received/count').expect(200)).body.pending).toBe(0);
    await b.post(`/shares/received/${expired}/accept`).send({}).expect(409);
    expect(await ctx.prisma.deck.count({ where: { userId: await ctx.userId('b') } })).toBe(0);
  });
});
