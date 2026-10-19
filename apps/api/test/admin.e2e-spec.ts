import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, exampleBatch, resetDb } from './helpers';

describe('admin data manager', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await request(ctx.server).post('/imports/commit').send({ batch: exampleBatch() }).expect(200);
  });

  it('lists entities with metadata and counts', async () => {
    const ents = await request(ctx.server).get('/admin/entities').expect(200);
    expect(ents.body.map((e: { key: string }) => e.key)).toEqual(expect.arrayContaining(['decks', 'questions', 'cards', 'reviews', 'notes', 'subjects', 'question-subjects', 'sessions', 'practice', 'exams', 'exam-responses', 'settings']));
    const counts = await request(ctx.server).get('/admin/counts').expect(200);
    expect(counts.body.questions.live).toBe(8);
  });

  it('lists with filter, search, sort and paging', async () => {
    const page1 = await request(ctx.server).get('/admin/questions?pageSize=3&sort=externalId&dir=asc').expect(200);
    expect(page1.body.total).toBe(8);
    expect(page1.body.items).toHaveLength(3);
    expect(page1.body.items[0].externalId).toBe('net-q001');
    const page3 = await request(ctx.server).get('/admin/questions?pageSize=3&page=3&sort=externalId&dir=asc').expect(200);
    expect(page3.body.items).toHaveLength(2);
    const filtered = await request(ctx.server).get(`/admin/questions?filters=${encodeURIComponent(JSON.stringify({ type: 'cloze' }))}`).expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0].type).toBe('cloze');
    const searched = await request(ctx.server).get('/admin/questions?search=q008').expect(200);
    expect(searched.body.total).toBe(1);
    const range = await request(ctx.server).get(`/admin/cards?filters=${encodeURIComponent(JSON.stringify({ reps: { min: 1 } }))}`).expect(200);
    expect(range.body.total).toBe(0);
    await request(ctx.server).get('/admin/nope').expect(404);
    await request(ctx.server).get('/admin/questions?filters=not-json').expect(400);
  });

  it('creates, updates, soft-deletes, restores and hard-deletes a deck', async () => {
    const created = await request(ctx.server).post('/admin/decks').send({ id: 'adm_deck', title: 'Admin deck', subject: 'Ops', language: 'en' }).expect(201);
    expect(created.body._id).toBe('adm_deck');
    await request(ctx.server).post('/admin/decks').send({ id: 'bad id!', title: 'x', subject: 'y', language: 'en' }).expect(400);
    const updated = await request(ctx.server).patch('/admin/decks/adm_deck').send({ title: 'Renamed', tagsJson: ['a', 'b'] }).expect(200);
    expect(updated.body.title).toBe('Renamed');
    expect(updated.body.tagsJson).toEqual(['a', 'b']);
    await request(ctx.server).delete('/admin/decks/adm_deck').expect(200);
    const live = await request(ctx.server).get('/admin/decks').expect(200);
    expect(live.body.items.some((d: { id: string }) => d.id === 'adm_deck')).toBe(false);
    const gone = await request(ctx.server).get('/admin/decks?deleted=deleted').expect(200);
    expect(gone.body.items.some((d: { id: string }) => d.id === 'adm_deck')).toBe(true);
    await request(ctx.server).post('/admin/decks/adm_deck/restore').expect(200);
    await request(ctx.server).delete('/admin/decks/adm_deck?permanent=true').expect(200);
    await request(ctx.server).get('/admin/decks/adm_deck').expect(404);
  });

  it('question payload edits are schema-validated and reset scheduling when the answer changes', async () => {
    const q = await ctx.prisma.question.findFirstOrThrow({ where: { externalId: 'net-q001' } });
    await request(ctx.server).post('/reviews').send({ questionId: q.id, rating: 3, idempotencyKey: 'adm-r1' }).expect(201);
    const bad = { ...(q.payloadJson as Record<string, unknown>), answer: { choiceId: 'zzz' } };
    const r = await request(ctx.server).patch(`/admin/questions/${q.id}`).send({ payloadJson: bad }).expect(422);
    expect(r.body.details.issues[0].message).toContain('not one of the choices');
    const typo = { ...(q.payloadJson as Record<string, unknown>), prompt: 'TCP 연결 설정 시 첫 플래그는?' };
    const t = await request(ctx.server).patch(`/admin/questions/${q.id}`).send({ payloadJson: typo }).expect(200);
    expect(t.body.resetSchedule).toBe(false);
    expect(t.body.revision).toBe(2);
    const answer = { ...typo, answer: { choiceId: 'd' } };
    const a = await request(ctx.server).patch(`/admin/questions/${q.id}`).send({ payloadJson: answer }).expect(200);
    expect(a.body.resetSchedule).toBe(true);
    const card = await ctx.prisma.cardState.findUniqueOrThrow({ where: { questionId: q.id } });
    expect(card.reps).toBe(0);
    // create a new question in the deck (gets a card and next sortIndex)
    const created = await request(ctx.server).post('/admin/questions').send({ deckId: 'computer_networks_01', payloadJson: { ...(q.payloadJson as object), id: 'net-q009' } }).expect(201);
    expect(created.body.externalId).toBe('net-q009');
    expect(created.body.sortIndex).toBe(8);
    expect(await ctx.prisma.cardState.count()).toBe(9);
    await request(ctx.server).post('/admin/questions').send({ deckId: 'computer_networks_01', payloadJson: { ...(q.payloadJson as object), id: 'net-q009' } }).expect(409);
  });

  it('bulk delete / patch / restore over selected rows', async () => {
    const list = await request(ctx.server).get('/admin/cards?pageSize=10').expect(200);
    const ids = list.body.items.slice(0, 3).map((i: { _id: string }) => i._id);
    const patched = await request(ctx.server).post('/admin/cards/bulk').send({ ids, action: 'patch', data: { flagged: true } }).expect(200);
    expect(patched.body.ok).toBe(3);
    const flagged = await request(ctx.server).get(`/admin/cards?filters=${encodeURIComponent(JSON.stringify({ flagged: true }))}`).expect(200);
    expect(flagged.body.total).toBe(3);
    const del = await request(ctx.server).post('/admin/notes/bulk').send({ ids: ['missing'], action: 'delete' }).expect(200);
    expect(del.body.failed).toBe(1);
    const qids = (await request(ctx.server).get('/admin/questions?pageSize=2').expect(200)).body.items.map((i: { _id: string }) => i._id);
    await request(ctx.server).post('/admin/questions/bulk').send({ ids: qids, action: 'delete' }).expect(200);
    expect((await request(ctx.server).get('/admin/questions').expect(200)).body.total).toBe(6);
    await request(ctx.server).post('/admin/questions/bulk').send({ ids: qids, action: 'restore' }).expect(200);
    expect((await request(ctx.server).get('/admin/questions').expect(200)).body.total).toBe(8);
    await request(ctx.server).delete('/admin/settings/1').expect(400);
    const s = await request(ctx.server).patch('/admin/settings/1').send({ newCardsPerDay: 7 }).expect(200);
    expect(s.body.newCardsPerDay).toBe(7);
  });

  it('notes and question-subjects (composite key) go through the generic CRUD', async () => {
    const q = await ctx.prisma.question.findFirstOrThrow({ where: { externalId: 'net-q002' } });
    const n = await request(ctx.server).post('/admin/notes').send({ questionId: q.id, reviewRound: 1, body: '$E=mc^2$ 메모' }).expect(201);
    await request(ctx.server).post('/admin/notes').send({ questionId: q.id, reviewRound: 1, body: 'dup' }).expect(409);
    await request(ctx.server).patch(`/admin/notes/${n.body.id}`).send({ body: 'edited' }).expect(200);
    const subj = await request(ctx.server).post('/admin/subjects').send({ name: 'Linear Algebra' }).expect(201);
    const link = await request(ctx.server).post('/admin/question-subjects').send({ questionId: q.id, subjectId: subj.body.id, source: 'manual' }).expect(201);
    expect(link.body._id).toBe(`${q.id}:${subj.body.id}`);
    await request(ctx.server).delete(`/admin/question-subjects/${q.id}:${subj.body.id}`).expect(200);
    const opts = await request(ctx.server).get('/admin/subjects/options?search=Linear').expect(200);
    expect(opts.body[0].label).toBe('Linear Algebra');
  });
});
