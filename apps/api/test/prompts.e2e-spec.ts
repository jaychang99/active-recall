import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, resetDb } from './helpers';
import { promptOptionsFixture as options } from './prompt-fixture';

describe('prompt history and presets', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => { await resetDb(ctx.prisma); });

  it('stores complete independent copies for each copy kind and preserves them after defaults change', async () => {
    for (const copyKind of ['bundle', 'prompt', 'bundle']) {
      await ctx.api.post('/prompt-library').send({ kind: 'history', name: '운영체제', copyKind, options }).expect(201);
    }
    await ctx.api.patch('/settings').send({ promptDefaults: { numberOfQuestions: 3, outputLanguage: 'ko' } }).expect(200);
    const list = (await ctx.api.get('/prompt-library?kind=history').expect(200)).body;
    expect(list.items).toHaveLength(3);
    expect(new Set(list.items.map((item: { id: string }) => item.id)).size).toBe(3);
    for (const item of list.items) expect(item.optionsJson).toEqual(options);
    expect((await ctx.api.get('/prompt-library?kind=preset').expect(200)).body.items).toEqual([]);
  });

  it('keeps presets independent of deleted history and scopes reads, rename and delete to their owner', async () => {
    const history = (await ctx.api.post('/prompt-library').send({ kind: 'history', name: '이력', copyKind: 'bundle', options }).expect(201)).body;
    const preset = (await ctx.api.post('/prompt-library').send({ kind: 'preset', name: '  시험 준비  ', options: history.optionsJson }).expect(201)).body;
    expect((await ctx.api.get(`/prompt-library/${history.id}`).expect(200)).body.optionsJson).toEqual(options);
    expect((await ctx.api.get(`/prompt-library/${preset.id}`).expect(200)).body.optionsJson).toEqual(options);
    expect(preset.name).toBe('시험 준비');
    const b = ctx.as('b');
    expect((await b.get('/prompt-library?kind=preset').expect(200)).body.items).toEqual([]);
    await b.get(`/prompt-library/${history.id}`).expect(404);
    await b.get(`/prompt-library/${preset.id}`).expect(404);
    await b.patch(`/prompt-library/${preset.id}`).send({ name: '탈취' }).expect(404);
    await b.delete(`/prompt-library/${preset.id}`).expect(404);
    await ctx.api.patch(`/prompt-library/${history.id}`).send({ name: '이력 변경' }).expect(404);
    await ctx.api.delete(`/prompt-library/${history.id}`).expect(200);
    await ctx.api.get(`/prompt-library/${history.id}`).expect(404);
    await ctx.api.patch(`/prompt-library/${preset.id}`).send({ name: '새 이름' }).expect(200);
    const saved = (await ctx.api.get('/prompt-library?kind=preset').expect(200)).body.items;
    expect(saved).toMatchObject([{ name: '새 이름', optionsJson: options }]);
    expect((await ctx.api.get('/prompt-library?kind=history').expect(200)).body.items).toEqual([]);
    await ctx.api.delete(`/prompt-library/${preset.id}`).expect(200);
    await ctx.api.delete(`/prompt-library/${preset.id}`).expect(404);
  });

  it('paginates and searches without dropping old presets after 100 saves', async () => {
    await ctx.api.get('/auth/me').expect(200);
    const userId = await ctx.userId('a');
    await ctx.prisma.promptSnapshot.createMany({ data: Array.from({ length: 125 }, (_, i) => ({ userId, kind: 'preset', name: `보관 ${i}`, optionsJson: options })) });
    const first = (await ctx.api.get('/prompt-library?kind=preset').expect(200)).body;
    expect(first.items).toHaveLength(20);
    expect(first.nextOffset).toBe(20);
    const all = [...first.items];
    for (let offset = 20; offset <= 120; offset += 20) all.push(...(await ctx.api.get(`/prompt-library?kind=preset&offset=${offset}`).expect(200)).body.items);
    expect(all).toHaveLength(125);
    expect(new Set(all.map((item) => item.id)).size).toBe(125);
    expect((await ctx.api.get('/prompt-library').query({ kind: 'preset', search: '보관 124' }).expect(200)).body.items).toHaveLength(1);
  });

  it('rejects partial snapshots, invalid nested settings, blank names and invalid copy kinds', async () => {
    const valid = { kind: 'history', copyKind: 'bundle', name: '이력', options };
    for (const invalid of [
      { ...valid, options: { numberOfQuestions: 10 } },
      { ...valid, options: { ...options, difficulty: { easy: 10, medium: -1, hard: 91 } } },
      { ...valid, options: { ...options, typeTarget: {} } },
      { ...valid, options: { ...options, numberOfQuestions: 'auto' } },
      { ...valid, name: '   ' }, { ...valid, copyKind: 'schema' }, { ...valid, copyKind: null },
    ]) await ctx.api.post('/prompt-library').send(invalid).expect(400);
    await ctx.api.get('/prompt-library?kind=preset&offset=-1').expect(400);
    await ctx.api.post('/prompt-library').send({ ...valid, options: { ...options, sourceMode: 'provided_materials', numberOfQuestions: 'auto' } }).expect(201);
  });

  it('includes snapshots in backups, restores them under fresh ids, and accepts older backups without them', async () => {
    await ctx.api.post('/prompt-library').send({ kind: 'preset', name: '프리셋', options }).expect(201);
    await ctx.api.post('/prompt-library').send({ kind: 'history', copyKind: 'prompt', name: '이력', options }).expect(201);
    const backup = (await ctx.api.get('/exports/backup.json').expect(200)).body;
    expect(backup.promptSnapshots).toHaveLength(2);
    expect(backup.promptSnapshots[0].userId).toBeUndefined();
    const b = ctx.as('b');
    await b.post('/exports/restore').send(backup).expect(200);
    const preset = (await b.get('/prompt-library?kind=preset').expect(200)).body.items[0];
    expect(preset.optionsJson).toEqual(options);
    expect(backup.promptSnapshots.map((item: { id: string }) => item.id)).not.toContain(preset.id);
    const { promptSnapshots: _snapshots, ...older } = backup;
    await b.post('/exports/restore').send(older).expect(200);
    expect((await b.get('/prompt-library?kind=preset').expect(200)).body.items).toEqual([]);
    expect((await ctx.api.get('/prompt-library?kind=preset').expect(200)).body.items).toHaveLength(1);
  });
});
