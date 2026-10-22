import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomInt } from 'node:crypto';
import type { Question } from '@recall/contracts';
import { StudyService, seededShuffle } from './study.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import type { FsrsService } from '../fsrs/fsrs.service';

vi.mock('node:crypto', () => ({ randomInt: vi.fn() }));

const question: Question = {
  id: 'q', type: 'short_answer', prompt: 'Question', difficulty: 1, tags: [],
  answer: { acceptedAnswers: ['answer'] }, explanation: { summary: 'Answer' },
};

function fixture() {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: `q${i}`, externalId: `q${i}`, type: question.type,
    payloadJson: { ...question, id: `q${i}` }, card: null,
    deck: { id: i < 6 ? 'deck-a' : 'deck-b', title: 'Deck', subject: '과목' },
    _count: { reviews: 0, notes: 0 },
  }));
  const prisma = { deck: { findFirst: vi.fn().mockResolvedValue({ id: 'deck-a', title: 'Deck' }) },
    reviewLog: { findMany: vi.fn().mockResolvedValue([]) }, question: { findMany: vi.fn().mockResolvedValue(rows) } };
  const settings = { get: vi.fn().mockResolvedValue({ timezone: 'Asia/Seoul', newCardsPerDay: 20, reviewsPerDay: 200, newCardOrder: 'random', showIntervalPreview: false }) };
  const fsrs = { emptyCard: vi.fn(), retrievability: vi.fn() };
  const service = new StudyService(prisma as unknown as PrismaService, settings as unknown as SettingsService, fsrs as unknown as FsrsService);
  return { service, prisma, rows };
}

afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe('queue randomization', () => {
  for (const mode of ['cram', 'practice', 'scheduled'] as const) {
    it(`${mode}: reshuffles the whole subject across decks even within one minute, before limiting`, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-22T03:00:00Z'));
      vi.mocked(randomInt).mockReturnValueOnce(7 as never).mockReturnValueOnce(42 as never);
      const { service, prisma, rows } = fixture();
      const opts = { scope: 'all', subject: '과목', mode, limit: 8 };
      const first = await service.queue('user', opts);
      const second = await service.queue('user', opts);
      const ids = (items: typeof first.items) => items.map((i) => i.questionId);
      expect(ids(first.items)).toEqual(seededShuffle(rows, 7).slice(0, 8).map((r) => r.id));
      expect(ids(second.items)).toEqual(seededShuffle(rows, 42).slice(0, 8).map((r) => r.id));
      expect(ids(first.items)).not.toEqual(ids(second.items));
      expect(new Set(first.items.map((i) => i.deck.id)).size).toBe(2);
      expect(prisma.question.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
        subjects: { some: { deletedAt: null, subject: { name: '과목', deletedAt: null } } },
      }) }));
    });
  }

  it('keeps authored order when shuffle is disabled and in default browse mode', async () => {
    vi.mocked(randomInt).mockReturnValue(7 as never);
    const { service, rows } = fixture();
    for (const opts of [{ mode: 'cram', shuffle: false }, { mode: 'browse' }] as const) {
      const result = await service.queue('user', { scope: 'deck-a', limit: 12, ...opts });
      expect(result.items.map((i) => i.questionId)).toEqual(rows.map((r) => r.id));
    }
  });
});
