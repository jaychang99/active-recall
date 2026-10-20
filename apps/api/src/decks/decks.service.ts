import { Injectable } from '@nestjs/common';
import { toPublicQuestion, type Question } from '@recall/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { SettingsService } from '../settings/settings.service';
import { endOfDayInTz } from '../common/time';
import { CardStatus, Prisma, type QuestionType } from '../generated/prisma/client';
import { SubjectsService } from '../subjects/subjects.service';

export interface DeckProgress {
  total: number;
  suspended: number;
  flagged: number;
  new: number;
  learning: number;
  review: number;
  relearning: number;
  dueToday: number;
}

export function emptyProgress(): DeckProgress {
  return { total: 0, suspended: 0, flagged: 0, new: 0, learning: 0, review: 0, relearning: 0, dueToday: 0 };
}

@Injectable()
export class DecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly subjectsService: SubjectsService,
  ) {}

  async progressByDeck(userId: string, deckIds?: string[]): Promise<Map<string, DeckProgress>> {
    const settings = await this.settings.get(userId);
    const now = new Date();
    const dayEnd = endOfDayInTz(now, settings.timezone);
    const where: Prisma.QuestionWhereInput = { userId, deletedAt: null, deck: { deletedAt: null }, ...(deckIds ? { deckId: { in: deckIds } } : {}) };
    const rows = await this.prisma.question.findMany({ where, select: { deckId: true, card: { select: { status: true, dueAt: true, suspended: true, flagged: true, lapses: true } } } });
    const map = new Map<string, DeckProgress>();
    for (const r of rows) {
      const p = map.get(r.deckId) ?? emptyProgress();
      p.total++;
      if (r.card?.suspended) p.suspended++;
      if (r.card?.flagged) p.flagged++;
      const status = r.card?.status ?? CardStatus.NEW;
      if (status === CardStatus.NEW) p.new++;
      else if (status === CardStatus.LEARNING) p.learning++;
      else if (status === CardStatus.REVIEW) p.review++;
      else p.relearning++;
      if (status !== CardStatus.NEW && r.card && !r.card.suspended && r.card.dueAt <= dayEnd) p.dueToday++;
      map.set(r.deckId, p);
    }
    return map;
  }

  async list(userId: string, opts: { subject?: string; includeDeleted?: boolean } = {}) {
    const decks = await this.prisma.deck.findMany({
      where: { userId, ...(opts.includeDeleted ? {} : { deletedAt: null }), ...(opts.subject ? { subject: opts.subject } : {}) },
      orderBy: [{ subject: 'asc' }, { updatedAt: 'desc' }],
    });
    const progress = await this.progressByDeck(userId);
    return decks.map((d) => ({ ...d, tags: d.tagsJson as string[], progress: progress.get(d.id) ?? emptyProgress() }));
  }

  /** Decks grouped by their primary (deck-level) subject. Question-level subjects live in SubjectsService. */
  async subjects(userId: string) {
    const decks = await this.list(userId);
    const bySubject = new Map<string, { subject: string; deckCount: number; progress: DeckProgress; decks: typeof decks }>();
    for (const d of decks) {
      const s = bySubject.get(d.subject) ?? { subject: d.subject, deckCount: 0, progress: emptyProgress(), decks: [] };
      s.deckCount++;
      for (const k of Object.keys(s.progress) as (keyof DeckProgress)[]) s.progress[k] += d.progress[k];
      s.decks.push(d);
      bySubject.set(d.subject, s);
    }
    return [...bySubject.values()].sort((a, b) => a.subject.localeCompare(b.subject));
  }

  async update(userId: string, id: string, data: { title?: string; description?: string | null; subject?: string; language?: string; tags?: string[] }) {
    const deck = await this.prisma.deck.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true, subject: true } });
    if (!deck) throw ApiError.notFound('Deck', id);
    const { tags, ...rest } = data;
    if (rest.subject !== undefined && !rest.subject.trim()) throw ApiError.badRequest('subject must not be empty');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.deck.update({ where: { id, userId }, data: { ...rest, ...(rest.subject ? { subject: rest.subject.trim() } : {}), ...(tags ? { tagsJson: tags } : {}) } });
      // Changing the primary subject moves every question's deck-sourced subject link along with it.
      if (rest.subject && rest.subject.trim() !== deck.subject) await this.subjectsService.relinkDeckSubject(tx, userId, id, deck.subject, rest.subject.trim());
      return row;
    });
    return { ...updated, tags: updated.tagsJson as string[] };
  }

  /** Give every question of the deck an additional subject (keeps the primary subject). */
  async addSubject(userId: string, id: string, name: string) {
    const deck = await this.prisma.deck.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true } });
    if (!deck) throw ApiError.notFound('Deck', id);
    return this.subjectsService.addSubjectToDeck(userId, id, name);
  }

  async restore(userId: string, id: string) {
    const deck = await this.prisma.deck.findUnique({ where: { id, userId }, select: { id: true, deletedAt: true } });
    if (!deck) throw ApiError.notFound('Deck', id);
    await this.prisma.deck.update({ where: { id, userId }, data: { deletedAt: null } });
    return { restored: id };
  }

  async get(userId: string, id: string) {
    const deck = await this.prisma.deck.findFirst({ where: { id, userId, deletedAt: null } });
    if (!deck) throw ApiError.notFound('Deck', id);
    const progress = (await this.progressByDeck(userId, [id])).get(id) ?? emptyProgress();
    const [notes, lastReview, tagRows] = await Promise.all([
      this.prisma.questionNote.count({ where: { userId, question: { deckId: id } } }),
      this.prisma.reviewLog.findFirst({ where: { userId, undone: false, question: { deckId: id } }, orderBy: { reviewedAt: 'desc' }, select: { reviewedAt: true } }),
      this.prisma.question.findMany({ where: { userId, deckId: id, deletedAt: null }, select: { payloadJson: true } }),
    ]);
    const tagCounts = new Map<string, number>();
    for (const r of tagRows) for (const t of (r.payloadJson as unknown as Question).tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    return {
      ...deck,
      tags: deck.tagsJson as string[],
      progress,
      noteCount: notes,
      lastReviewedAt: lastReview?.reviewedAt ?? null,
      questionTags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })),
    };
  }

  async questions(
    userId: string,
    deckId: string,
    opts: { page: number; pageSize: number; type?: QuestionType; tag?: string; q?: string; includeAnswers: boolean; includeInactive: boolean; flagged?: boolean; suspended?: boolean; status?: CardStatus; sort?: string },
  ) {
    const deck = await this.prisma.deck.findFirst({ where: { id: deckId, userId, deletedAt: null }, select: { id: true } });
    if (!deck) throw ApiError.notFound('Deck', deckId);
    const where: Prisma.QuestionWhereInput = {
      userId,
      deckId,
      ...(opts.includeInactive ? {} : { deletedAt: null }),
      ...(opts.type ? { type: opts.type } : {}),
    };
    // tag / text filters are evaluated in JS (JSON column); decks are capped at 1000 questions per import.
    const all = await this.prisma.question.findMany({
      where,
      orderBy: { sortIndex: 'asc' },
      include: { card: true, subjects: { where: { deletedAt: null, subject: { deletedAt: null } }, include: { subject: { select: { id: true, name: true, color: true } } } }, _count: { select: { notes: { where: { deletedAt: null } }, reviews: { where: { undone: false, deletedAt: null } } } } },
    });
    const needle = opts.q?.trim().toLowerCase();
    const filtered = all.filter((row) => {
      const q = row.payloadJson as unknown as Question;
      if (opts.flagged && !row.card?.flagged) return false;
      if (opts.suspended && !row.card?.suspended) return false;
      if (opts.status && (row.card?.status ?? CardStatus.NEW) !== opts.status) return false;
      if (opts.tag && !q.tags.includes(opts.tag)) return false;
      if (needle && !(q.prompt.toLowerCase().includes(needle) || q.id.toLowerCase().includes(needle) || q.explanation.summary.toLowerCase().includes(needle))) return false;
      return true;
    });
    const sorters: Record<string, (a: (typeof all)[number], b: (typeof all)[number]) => number> = {
      deck: (a, b) => a.sortIndex - b.sortIndex,
      due: (a, b) => (a.card?.dueAt.getTime() ?? 0) - (b.card?.dueAt.getTime() ?? 0),
      lapses: (a, b) => (b.card?.lapses ?? 0) - (a.card?.lapses ?? 0),
      difficulty: (a, b) => (b.card?.difficulty ?? 0) - (a.card?.difficulty ?? 0),
      reps: (a, b) => (b.card?.reps ?? 0) - (a.card?.reps ?? 0),
      updated: (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    };
    filtered.sort(sorters[opts.sort ?? 'deck'] ?? sorters.deck!);
    const start = (opts.page - 1) * opts.pageSize;
    const items = filtered.slice(start, start + opts.pageSize).map((row) => {
      const q = row.payloadJson as unknown as Question;
      return {
        id: row.id,
        externalId: row.externalId,
        type: row.type,
        revision: row.revision,
        active: row.deletedAt === null,
        deletedAt: row.deletedAt,
        contentHash: row.contentHash,
        answerHash: row.answerHash,
        updatedAt: row.updatedAt,
        question: opts.includeAnswers ? q : toPublicQuestion(q),
        card: row.card
          ? { status: row.card.status, dueAt: row.card.dueAt, reps: row.card.reps, lapses: row.card.lapses, stability: row.card.stability, difficulty: row.card.difficulty, lastReviewAt: row.card.lastReviewAt, suspended: row.card.suspended, flagged: row.card.flagged, buriedUntil: row.card.buriedUntil, version: row.card.version }
          : null,
        noteCount: row._count.notes,
        reviewCount: row._count.reviews,
        subjects: row.subjects.map((s) => ({ id: s.subject.id, name: s.subject.name, color: s.subject.color, source: s.source })),
      };
    });
    return { page: opts.page, pageSize: opts.pageSize, total: filtered.length, items };
  }

  /** Soft delete by default: the deck and its history stay in the database and can be restored.
   *  `permanent` hard-deletes the deck with all questions, cards, reviews, notes and exams (cascade). */
  async remove(userId: string, id: string, permanent = false) {
    const deck = await this.prisma.deck.findFirst({ where: { id, userId, ...(permanent ? {} : { deletedAt: null }) }, select: { id: true } });
    if (!deck) throw ApiError.notFound('Deck', id);
    if (permanent) {
      await this.prisma.deck.delete({ where: { id, userId } });
      return { deleted: id, permanent: true };
    }
    await this.prisma.deck.update({ where: { id, userId }, data: { deletedAt: new Date() } });
    return { deleted: id, permanent: false };
  }
}
