import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { SettingsService } from '../settings/settings.service';
import { endOfDayInTz } from '../common/time';
import { CardStatus } from '../generated/prisma/client';
import { emptyProgress, type DeckProgress } from '../decks/decks.service';
import { archiveFilter, latestReviewsByQuestion, recentReviewsFirst, type CollectionListOptions } from '../common/collections';

export interface SubjectSummary {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  questionCount: number;
  deckIds: string[];
  progress: DeckProgress;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  lastReviewedAt: Date | null;
}

@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Find or create by name (names are trimmed; matching is case-sensitive but trimmed). */
  async ensure(tx: Tx, userId: string, name: string) {
    const n = name.trim();
    if (!n) throw ApiError.badRequest('Subject name must not be empty');
    const existing = await tx.subject.findUnique({ where: { userId_name: { userId, name: n } } });
    if (existing) {
      if (existing.deletedAt) return tx.subject.update({ where: { id: existing.id, userId }, data: { deletedAt: null } });
      return existing;
    }
    return tx.subject.create({ data: { userId, name: n } });
  }

  /** Assign `name` to every question (used by imports for deck.subject; shares also add `manual` ones). Keeps manual assignments. */
  async assignDeckSubject(tx: Tx, userId: string, questionIds: string[], name: string, source: 'deck' | 'manual' = 'deck') {
    if (!questionIds.length) return;
    const subject = await this.ensure(tx, userId, name);
    const existing = await tx.questionSubject.findMany({ where: { userId, subjectId: subject.id, questionId: { in: questionIds } }, select: { questionId: true, deletedAt: true } });
    const have = new Map(existing.map((e) => [e.questionId, e.deletedAt]));
    const toCreate = questionIds.filter((id) => !have.has(id));
    if (toCreate.length) await tx.questionSubject.createMany({ data: toCreate.map((questionId) => ({ userId, questionId, subjectId: subject.id, source })) });
    const toRestore = questionIds.filter((id) => have.get(id));
    if (toRestore.length) await tx.questionSubject.updateMany({ where: { userId, subjectId: subject.id, questionId: { in: toRestore } }, data: { deletedAt: null } });
  }

  /**
   * Move a deck's primary subject: deck-sourced links to `oldName` are soft-deleted and every live
   * question of the deck gets a deck-sourced link to `newName` (created on demand). Manual links stay.
   */
  async relinkDeckSubject(tx: Tx, userId: string, deckId: string, oldName: string | null, newName: string) {
    const live = await tx.question.findMany({ where: { userId, deckId, deletedAt: null }, select: { id: true } });
    const ids = live.map((q) => q.id);
    if (oldName && oldName.trim() !== newName.trim()) {
      const old = await tx.subject.findUnique({ where: { userId_name: { userId, name: oldName.trim() } } });
      if (old) await tx.questionSubject.updateMany({ where: { userId, subjectId: old.id, source: 'deck', questionId: { in: ids }, deletedAt: null }, data: { deletedAt: new Date() } });
    }
    await this.assignDeckSubject(tx, userId, ids, newName);
  }

  /** Add `name` as an extra (manual) subject to every live question of the deck. */
  async addSubjectToDeck(userId: string, deckId: string, name: string) {
    const live = await this.prisma.question.findMany({ where: { userId, deckId, deletedAt: null }, select: { id: true } });
    return this.bulkAssign(userId, live.map((q) => q.id), name);
  }

  async list(userId: string, opts: CollectionListOptions = {}): Promise<SubjectSummary[]> {
    const settings = await this.settings.get(userId);
    const dayEnd = endOfDayInTz(new Date(), settings.timezone);
    const subjects = await this.prisma.subject.findMany({
      where: { userId, deletedAt: null, ...archiveFilter(opts) },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: {
        questions: {
          where: { deletedAt: null, question: { deletedAt: null, deck: { deletedAt: null } } },
          select: { question: { select: { id: true, deckId: true, card: { select: { status: true, dueAt: true, suspended: true, flagged: true } } } } },
        },
      },
    });
    const reviews = await latestReviewsByQuestion(userId, this.prisma, { deck: { deletedAt: null }, subjects: { some: { deletedAt: null, subjectId: { in: subjects.map((s) => s.id) } } } });
    return recentReviewsFirst(subjects.map((s) => {
      const progress = emptyProgress();
      let lastReviewedAt: Date | null = null;
      const deckIds = new Set<string>();
      for (const qs of s.questions) {
        const c = qs.question.card;
        const lastReview = reviews.get(qs.question.id);
        if (lastReview && (!lastReviewedAt || lastReview > lastReviewedAt)) lastReviewedAt = lastReview;
        deckIds.add(qs.question.deckId);
        progress.total++;
        const status = c?.status ?? CardStatus.NEW;
        if (c?.suspended) progress.suspended++;
        if (c?.flagged) progress.flagged++;
        if (status === CardStatus.NEW) progress.new++;
        else if (status === CardStatus.LEARNING) progress.learning++;
        else if (status === CardStatus.REVIEW) progress.review++;
        else progress.relearning++;
        if (status !== CardStatus.NEW && c && !c.suspended && c.dueAt <= dayEnd) progress.dueToday++;
      }
      return { id: s.id, name: s.name, color: s.color, description: s.description, questionCount: s.questions.length, deckIds: [...deckIds], progress, createdAt: s.createdAt, updatedAt: s.updatedAt, archivedAt: s.archivedAt, lastReviewedAt };
    }));
  }

  async setArchived(userId: string, id: string, archived: boolean) {
    const subject = await this.prisma.subject.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true, archivedAt: true } });
    if (!subject) throw ApiError.notFound('Subject', id);
    return this.prisma.subject.update({ where: { id, userId }, data: { archivedAt: archived ? (subject.archivedAt ?? new Date()) : null } });
  }

  async create(userId: string, data: { name: string; color?: string; description?: string }) {
    const s = await this.ensure(this.prisma, userId, data.name);
    if (s.archivedAt) throw ApiError.conflict('이미 아카이브한 과목입니다. 아카이브 탭에서 해제하세요.');
    return this.prisma.subject.update({ where: { id: s.id, userId }, data: { color: data.color ?? s.color, description: data.description ?? s.description } });
  }

  async update(userId: string, id: string, data: { name?: string; color?: string | null; description?: string | null }) {
    const s = await this.prisma.subject.findFirst({ where: { id, userId, deletedAt: null } });
    if (!s) throw ApiError.notFound('Subject', id);
    if (data.name !== undefined) {
      const n = data.name.trim();
      if (!n) throw ApiError.badRequest('Subject name must not be empty');
      const clash = await this.prisma.subject.findUnique({ where: { userId_name: { userId, name: n } } });
      if (clash && clash.id !== id) throw ApiError.conflict(`Subject "${n}" already exists`);
      data.name = n;
    }
    return this.prisma.subject.update({ where: { id, userId }, data });
  }

  async remove(userId: string, id: string) {
    const s = await this.prisma.subject.findFirst({ where: { id, userId, deletedAt: null } });
    if (!s) throw ApiError.notFound('Subject', id);
    await this.prisma.$transaction([
      this.prisma.subject.update({ where: { id, userId }, data: { deletedAt: new Date() } }),
      this.prisma.questionSubject.updateMany({ where: { userId, subjectId: id, deletedAt: null }, data: { deletedAt: new Date() } }),
    ]);
    return { deleted: id };
  }

  async forQuestion(userId: string, questionId: string) {
    const rows = await this.prisma.questionSubject.findMany({ where: { userId, questionId, deletedAt: null, subject: { deletedAt: null } }, include: { subject: true } });
    return rows.map((r) => ({ id: r.subject.id, name: r.subject.name, color: r.subject.color, source: r.source }));
  }

  /** Replace the manual subjects of a question (deck-sourced ones stay). */
  async setForQuestion(userId: string, questionId: string, names: string[]) {
    const q = await this.prisma.question.findFirst({ where: { id: questionId, userId, deletedAt: null }, select: { id: true } });
    if (!q) throw ApiError.notFound('Question', questionId);
    await this.prisma.$transaction(async (tx) => {
      const wanted = new Map<string, string>();
      for (const n of names) {
        const s = await this.ensure(tx, userId, n);
        wanted.set(s.id, s.name);
      }
      const current = await tx.questionSubject.findMany({ where: { userId, questionId } });
      for (const c of current) {
        if (wanted.has(c.subjectId)) {
          if (c.deletedAt) await tx.questionSubject.update({ where: { questionId_subjectId: { questionId, subjectId: c.subjectId }, userId }, data: { deletedAt: null } });
        } else if (c.source === 'manual' && !c.deletedAt) {
          await tx.questionSubject.update({ where: { questionId_subjectId: { questionId, subjectId: c.subjectId }, userId }, data: { deletedAt: new Date() } });
        }
      }
      const have = new Set(current.map((c) => c.subjectId));
      for (const sid of wanted.keys()) if (!have.has(sid)) await tx.questionSubject.create({ data: { userId, questionId, subjectId: sid, source: 'manual' } });
    });
    return this.forQuestion(userId, questionId);
  }

  async bulkAssign(userId: string, questionIds: string[], name: string, remove = false) {
    const subject = await this.ensure(this.prisma, userId, name);
    if (remove) {
      const r = await this.prisma.questionSubject.updateMany({ where: { userId, subjectId: subject.id, questionId: { in: questionIds }, deletedAt: null }, data: { deletedAt: new Date() } });
      return { subject: subject.name, removed: r.count };
    }
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.questionSubject.findMany({ where: { userId, subjectId: subject.id, questionId: { in: questionIds } }, select: { questionId: true } });
      const have = new Set(existing.map((e) => e.questionId));
      const create = questionIds.filter((id) => !have.has(id));
      if (create.length) await tx.questionSubject.createMany({ data: create.map((questionId) => ({ userId, questionId, subjectId: subject.id, source: 'manual' })) });
      await tx.questionSubject.updateMany({ where: { userId, subjectId: subject.id, questionId: { in: questionIds } }, data: { deletedAt: null } });
    });
    return { subject: subject.name, assigned: questionIds.length };
  }
}
