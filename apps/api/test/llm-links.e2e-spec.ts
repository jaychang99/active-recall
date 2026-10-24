import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, exampleBatch, resetDb } from './helpers';

describe('LLM answer links (one per review round)', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let qid: string;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await ctx.api.post('/imports/commit').send({ batch: exampleBatch() }).expect(200);
    qid = (await ctx.prisma.question.findFirstOrThrow({ where: { userId: await ctx.userId('a'), externalId: 'net-q001' } })).id;
  });

  it('saves one link per round up to the current round, replaces, soft-deletes and revives', async () => {
    await ctx.api.put(`/questions/${qid}/llm-links/1`).send({ url: 'https://chatgpt.com/share/round-1' }).expect(200);
    await ctx.api.put(`/questions/${qid}/llm-links/2`).send({ url: 'https://claude.ai/share/x' }).expect(400); // round 2 not reached yet
    await ctx.api.post('/reviews').send({ questionId: qid, rating: 3, idempotencyKey: 'k-l1' }).expect(201);
    await ctx.api.put(`/questions/${qid}/llm-links/2`).send({ url: 'https://claude.ai/share/x' }).expect(200);
    await ctx.api.put(`/questions/${qid}/llm-links/2`).send({ url: 'https://claude.ai/share/y' }).expect(200);

    let list = (await ctx.api.get(`/questions/${qid}/llm-links`).expect(200)).body;
    expect(list.currentRound).toBe(2);
    expect(list.links.map((l: { reviewRound: number; url: string }) => [l.reviewRound, l.url])).toEqual([[2, 'https://claude.ai/share/y'], [1, 'https://chatgpt.com/share/round-1']]);
    expect(list.links[1].review).toMatchObject({ rating: 3 });
    expect(list.links[0].review).toBeNull();

    await ctx.api.delete(`/questions/${qid}/llm-links/1`).expect(200);
    await ctx.api.delete(`/questions/${qid}/llm-links/1`).expect(404);
    list = (await ctx.api.get(`/questions/${qid}/llm-links`).expect(200)).body;
    expect(list.links).toHaveLength(1);
    expect(await ctx.prisma.llmAnswerLink.count({ where: { userId: await ctx.userId('a'), deletedAt: { not: null } } })).toBe(1);
    await ctx.api.put(`/questions/${qid}/llm-links/1`).send({ url: 'https://gemini.google.com/share/z' }).expect(200);
    expect((await ctx.api.get(`/questions/${qid}/llm-links`).expect(200)).body.links).toHaveLength(2);
  });

  it('rejects non-public links and keeps links private to their owner', async () => {
    for (const url of ['http://localhost:4000/health', 'http://169.254.169.254/latest/meta-data', 'file:///etc/passwd', 'not a link']) {
      await ctx.api.put(`/questions/${qid}/llm-links/1`).send({ url }).expect(400);
    }
    await ctx.api.get('/link-preview').query({ url: 'http://127.0.0.1:4000/' }).expect(400);
    await ctx.api.put(`/questions/${qid}/llm-links/1`).send({ url: 'https://chatgpt.com/share/a' }).expect(200);
    await ctx.as('b').get(`/questions/${qid}/llm-links`).expect(404);
    await ctx.as('b').put(`/questions/${qid}/llm-links/1`).send({ url: 'https://chatgpt.com/share/b' }).expect(404);
  });

  it('round-trips through backup/restore with remapped question ids', async () => {
    await ctx.api.put(`/questions/${qid}/llm-links/1`).send({ url: 'https://chatgpt.com/share/backup' }).expect(200);
    const backup = (await ctx.api.get('/exports/backup.json').expect(200)).body;
    expect(backup.llmLinks).toHaveLength(1);
    await ctx.api.post('/exports/restore?force=true').send(backup).expect(200);
    const uid = await ctx.userId('a');
    const restored = await ctx.prisma.question.findFirstOrThrow({ where: { userId: uid, externalId: 'net-q001' } });
    expect(restored.id).not.toBe(qid);
    expect((await ctx.api.get(`/questions/${restored.id}/llm-links`).expect(200)).body.links[0].url).toBe('https://chatgpt.com/share/backup');
    // a backup from before links existed still restores
    delete backup.llmLinks;
    await ctx.api.post('/exports/restore?force=true').send(backup).expect(200);
  });
});
