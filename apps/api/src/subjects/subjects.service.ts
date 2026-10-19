import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { SettingsService } from '../settings/settings.service';
import { endOfDayInTz } from '../common/time';
import { CardStatus, Prisma } from '../generated/prisma/client';
import { emptyProgress, type DeckProgress } from '../decks/decks.service';

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
}

@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Find or create by name (names are trimmed; matching is case-sensitive but trimmed). */
  async ensure(tx: Prisma.TransactionClient | PrismaService, name: string) {
    const n = name.trim();
    if (!n) throw ApiError.badRequest('Subject name must not be empty');
    const existing = await tx.subject.findUnique({ where: { name: n } });
    if (existing) {
      if (existing.deletedAt) return tx.subject.update({ where: { id: existing.id }, data: { deletedAt: null } });
      return existing;
    }
    return tx.subject.create({ data: { name: n } });
  }

  /** Assign `name` to every question (used by imports for deck.subject). Keeps manual assignments. */
  async assignDeckSubject(tx: Prisma.TransactionClient, questionIds: string[], name: string) {
    if (!questionIds.length) return;
    const subject = await this.ensure(tx, name);
    const existing = await tx.questionSubject.findMany({ where: { subjectId: subject.id, questionId: { in: questionIds } }, select: { questionId: true, deletedAt: true } });
    const have = new Map(existing.map((e) => [e.questionId, e.deletedAt]));
    const toCreate = questionIds.filter((id) => !have.has(id));
    if (toCreate.length) await tx.questionSubject.createMany({ data: toCreate.map((questionId) => ({ questionId, subjectId: subject.id, source: 'deck' })) });
    const toRestore = questionIds.filter((id) => have.get(id));
    if (toRestore.length) await tx.questionSubject.updateMany({ where: { subjectId: subject.id, questionId: { in: toRestore } }, data: { deletedAt: null } });
  }

  /**
   * Move a deck's primary subject: deck-sourced links to `oldName` are soft-deleted and every live
   * question of the deck gets a deck-sourced link to `newName` (created on demand). Manual links stay.
   */
  async relinkDeckSubject(tx: Prisma.TransactionClient, deckId: string, oldName: string | null, newName: string) {
    const live = await tx.question.findMany({ where: { deckId, deletedAt: null }, select: { id: true } });
    const ids = live.map((q) => q.id);
    if (oldName && oldName.trim() !== newName.trim()) {
      const old = await tx.subject.findUnique({ where: { name: oldName.trim() } });
      if (old) await tx.questionSubject.updateMany({ where: { subjectId: old.id, source: 'deck', questionId: { in: ids }, deletedAt: null }, data: { deletedAt: new Date() } });
    }
    await this.assignDeckSubject(tx, ids, newName);
  }

  /** Add `name` as an extra (manual) subject to every live question of the deck. */
  async addSubjectToDeck(deckId: string, name: string) {
    const live = await this.prisma.question.findMany({ where: { deckId, deletedAt: null }, select: { id: true } });
    return this.bulkAssign(live.map((q) => q.id), name);
  }

  async list(): Promise<SubjectSummary[]> {
    const settings = await this.settings.get();
    const dayEnd = endOfDayInTz(new Date(), settings.timezone);
    const subjects = await this.prisma.subject.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        questions: {
          where: { deletedAt: null, question: { deletedAt: null, deck: { deletedAt: null } } },
          select: { question: { select: { deckId: true, card: { select: { status: true, dueAt: true, suspended: true, flagged: true } } } } },
        },
      },
    });
    return subjects.map((s) => {
      const progress = emptyProgress();
      const deckIds = new Set<string>();
      for (const qs of s.questions) {
        const c = qs.question.card;
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
      return { id: s.id, name: s.name, color: s.color, description: s.description, questionCount: s.questions.length, deckIds: [...deckIds], progress, createdAt: s.createdAt, updatedAt: s.updatedAt };
    });
  }

  async create(data: { name: string; color?: string; description?: string }) {
    const s = await this.ensure(this.prisma, data.name);
    return this.prisma.subject.update({ where: { id: s.id }, data: { color: data.color ?? s.color, description: data.description ?? s.description } });
  }

  async update(id: string, data: { name?: string; color?: string | null; description?: string | null }) {
    const s = await this.prisma.subject.findFirst({ where: { id, deletedAt: null } });
    if (!s) throw ApiError.notFound('Subject', id);
    if (data.name !== undefined) {
      const n = data.name.trim();
      if (!n) throw ApiError.badRequest('Subject name must not be empty');
      const clash = await this.prisma.subject.findUnique({ where: { name: n } });
      if (clash && clash.id !== id) throw ApiError.conflict(`Subject "${n}" already exists`);
      data.name = n;
    }
    return this.prisma.subject.update({ where: { id }, data });
  }

  async remove(id: string) {
    const s = await this.prisma.subject.findFirst({ where: { id, deletedAt: null } });
    if (!s) throw ApiError.notFound('Subject', id);
    await this.prisma.$transaction([
      this.prisma.subject.update({ where: { id }, data: { deletedAt: new Date() } }),
      this.prisma.questionSubject.updateMany({ where: { subjectId: id, deletedAt: null }, data: { deletedAt: new Date() } }),
    ]);
    return { deleted: id };
  }

  async forQuestion(questionId: string) {
    const rows = await this.prisma.questionSubject.findMany({ where: { questionId, deletedAt: null, subject: { deletedAt: null } }, include: { subject: true } });
    return rows.map((r) => ({ id: r.subject.id, name: r.subject.name, color: r.subject.color, source: r.source }));
  }

  /** Replace the manual subjects of a question (deck-sourced ones stay). */
  async setForQuestion(questionId: string, names: string[]) {
    const q = await this.prisma.question.findFirst({ where: { id: questionId, deletedAt: null }, select: { id: true } });
    if (!q) throw ApiError.notFound('Question', questionId);
    await this.prisma.$transaction(async (tx) => {
      const wanted = new Map<string, string>();
      for (const n of names) {
        const s = await this.ensure(tx, n);
        wanted.set(s.id, s.name);
      }
      const current = await tx.questionSubject.findMany({ where: { questionId } });
      for (const c of current) {
        if (wanted.has(c.subjectId)) {
          if (c.deletedAt) await tx.questionSubject.update({ where: { questionId_subjectId: { questionId, subjectId: c.subjectId } }, data: { deletedAt: null } });
        } else if (c.source === 'manual' && !c.deletedAt) {
          await tx.questionSubject.update({ where: { questionId_subjectId: { questionId, subjectId: c.subjectId } }, data: { deletedAt: new Date() } });
        }
      }
      const have = new Set(current.map((c) => c.subjectId));
      for (const sid of wanted.keys()) if (!have.has(sid)) await tx.questionSubject.create({ data: { questionId, subjectId: sid, source: 'manual' } });
    });
    return this.forQuestion(questionId);
  }

  async bulkAssign(questionIds: string[], name: string, remove = false) {
    const subject = await this.ensure(this.prisma, name);
    if (remove) {
      const r = await this.prisma.questionSubject.updateMany({ where: { subjectId: subject.id, questionId: { in: questionIds }, deletedAt: null }, data: { deletedAt: new Date() } });
      return { subject: subject.name, removed: r.count };
    }
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.questionSubject.findMany({ where: { subjectId: subject.id, questionId: { in: questionIds } }, select: { questionId: true } });
      const have = new Set(existing.map((e) => e.questionId));
      const create = questionIds.filter((id) => !have.has(id));
      if (create.length) await tx.questionSubject.createMany({ data: create.map((questionId) => ({ questionId, subjectId: subject.id, source: 'manual' })) });
      await tx.questionSubject.updateMany({ where: { subjectId: subject.id, questionId: { in: questionIds } }, data: { deletedAt: null } });
    });
    return { subject: subject.name, assigned: questionIds.length };
  }
}
