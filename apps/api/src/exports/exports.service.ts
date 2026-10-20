import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION, validateBatch, type Question, type QuestionBatch } from '@recall/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { toJson } from '../common/json';
import { ImportsService } from '../imports/imports.service';

type Row = Record<string, unknown>;

export const BACKUP_FORMAT = 'recall-studio-backup';
/** v1: single-user era (Deck.id was the slug, settings id=1). v2: per-user (Deck has `slug`). Both restore. */
export const BACKUP_VERSION = 2;

/** Portable exports: a deck back into the question-batch contract, and a full per-user JSON backup. */
@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: ImportsService,
  ) {}

  /** Re-export a deck as a schema-valid question batch (re-importable anywhere; `deck.id` is the slug). */
  async deckBatch(userId: string, deckId: string): Promise<QuestionBatch> {
    const deck = await this.prisma.deck.findFirst({ where: { id: deckId, userId, deletedAt: null }, include: { questions: { where: { deletedAt: null }, orderBy: { sortIndex: 'asc' } } } });
    if (!deck) throw ApiError.notFound('Deck', deckId);
    const batch: QuestionBatch = {
      schemaVersion: SCHEMA_VERSION,
      deck: { id: deck.slug, title: deck.title, ...(deck.description ? { description: deck.description } : {}), subject: deck.subject, language: deck.language, tags: deck.tagsJson as string[] },
      questions: deck.questions.map((q) => q.payloadJson as unknown as Question),
    };
    const v = validateBatch(batch);
    if (!v.ok) throw ApiError.conflict('Stored deck no longer validates against the schema', { issues: v.issues });
    return batch;
  }

  /** Everything the user owns, as raw rows (ids included; `userId` stripped — restore injects the importing user). */
  async backup(userId: string) {
    const where = { userId };
    const [decks, questions, cards, reviews, notes, sessions, practices, exams, responses, settings, subjects, questionSubjects] = await Promise.all([
      this.prisma.deck.findMany({ where }),
      this.prisma.question.findMany({ where }),
      this.prisma.cardState.findMany({ where }),
      this.prisma.reviewLog.findMany({ where }),
      this.prisma.questionNote.findMany({ where }),
      this.prisma.studySession.findMany({ where }),
      this.prisma.practiceLog.findMany({ where }),
      this.prisma.examAttempt.findMany({ where }),
      this.prisma.examResponse.findMany({ where }),
      this.prisma.appSettings.findMany({ where }),
      this.prisma.subject.findMany({ where }),
      this.prisma.questionSubject.findMany({ where }),
    ]);
    const strip = (rows: Row[]) => rows.map(({ userId: _u, ...r }) => r);
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      decks: strip(decks),
      questions: strip(questions),
      cards: strip(cards),
      reviews: strip(reviews),
      notes: strip(notes),
      sessions: strip(sessions),
      practices: strip(practices),
      exams: strip(exams),
      responses: strip(responses),
      settings: strip(settings),
      subjects: strip(subjects),
      questionSubjects: strip(questionSubjects),
    };
  }

  /**
   * Restore a v1 or v2 backup INTO THIS USER'S ACCOUNT, replacing whatever they had (refuses when the
   * account already holds decks unless `force`). Every id is regenerated and every foreign key re-mapped,
   * so a backup taken by anyone, on any instance, restores without collisions.
   */
  async restore(userId: string, payload: Record<string, unknown>, force = false) {
    const version = payload.version;
    if (payload.format !== BACKUP_FORMAT || (version !== 1 && version !== 2)) throw ApiError.badRequest('Not a Recall Studio backup file (v1 or v2)');
    const existing = await this.prisma.deck.count({ where: { userId } });
    if (existing > 0 && !force) throw ApiError.conflict('Your account already contains decks. Pass force=true to replace everything with the backup.');

    const arr = (k: string) => (Array.isArray(payload[k]) ? (payload[k] as Row[]) : []);
    const fix = (row: Row): Row => {
      const out: Row = {};
      for (const [k, v] of Object.entries(row)) {
        if (k === 'userId') continue;
        out[k] = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) && /At$|^due|Until$/.test(k) ? new Date(v) : v;
      }
      return out;
    };
    const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

    // --- id maps (old → new) ---
    const deckIds = new Map<string, string>();
    const subjectIds = new Map<string, string>();
    const questionIds = new Map<string, string>();
    const sessionIds = new Map<string, string>();
    const reviewIds = new Map<string, string>();
    const examIds = new Map<string, string>();

    const decks: Row[] = [];
    const seenSlugs = new Set<string>();
    for (const r of arr('decks').map(fix)) {
      const oldId = str(r.id);
      const slug = version === 1 ? str(r.id) : str(r.slug);
      if (!oldId || !slug || seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
      const id = randomUUID();
      deckIds.set(oldId, id);
      decks.push({ ...r, id, slug, userId });
    }
    const subjects: Row[] = [];
    const seenNames = new Set<string>();
    for (const r of arr('subjects').map(fix)) {
      const oldId = str(r.id);
      const name = str(r.name);
      if (!oldId || !name || seenNames.has(name)) continue;
      seenNames.add(name);
      const id = randomUUID();
      subjectIds.set(oldId, id);
      subjects.push({ ...r, id, userId });
    }
    const questions: Row[] = [];
    for (const r of arr('questions').map(fix)) {
      const oldId = str(r.id);
      const deckId = deckIds.get(str(r.deckId) ?? '');
      if (!oldId || !deckId) continue;
      const id = randomUUID();
      questionIds.set(oldId, id);
      questions.push({ ...r, id, deckId, userId });
    }
    const questionSubjects: Row[] = [];
    const seenQs = new Set<string>();
    for (const r of arr('questionSubjects').map(fix)) {
      const questionId = questionIds.get(str(r.questionId) ?? '');
      const subjectId = subjectIds.get(str(r.subjectId) ?? '');
      if (!questionId || !subjectId || seenQs.has(`${questionId}:${subjectId}`)) continue;
      seenQs.add(`${questionId}:${subjectId}`);
      questionSubjects.push({ ...r, questionId, subjectId, userId });
    }
    const cards: Row[] = [];
    for (const r of arr('cards').map(fix)) {
      const questionId = questionIds.get(str(r.questionId) ?? '');
      if (!questionId) continue;
      cards.push({ ...r, questionId, userId });
    }
    const sessions: Row[] = [];
    for (const r of arr('sessions').map(fix)) {
      const oldId = str(r.id);
      if (!oldId) continue;
      const oldDeck = str(r.deckId);
      const deckId = oldDeck ? (deckIds.get(oldDeck) ?? null) : null;
      if (oldDeck && !deckId) continue;
      const id = randomUUID();
      sessionIds.set(oldId, id);
      sessions.push({ ...r, id, deckId, userId });
    }
    const reviews: Row[] = [];
    const seenKeys = new Set<string>();
    for (const r of arr('reviews').map(fix)) {
      const oldId = str(r.id);
      const questionId = questionIds.get(str(r.questionId) ?? '');
      const key = str(r.idempotencyKey);
      if (!oldId || !questionId || !key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      const oldSession = str(r.sessionId);
      const id = randomUUID();
      reviewIds.set(oldId, id);
      reviews.push({ ...r, id, questionId, sessionId: oldSession ? (sessionIds.get(oldSession) ?? null) : null, userId });
    }
    const notes: Row[] = [];
    for (const r of arr('notes').map(fix)) {
      const questionId = questionIds.get(str(r.questionId) ?? '');
      if (!questionId) continue;
      const oldLog = str(r.reviewLogId);
      notes.push({ ...r, id: randomUUID(), questionId, reviewLogId: oldLog ? (reviewIds.get(oldLog) ?? null) : null, userId });
    }
    const practices: Row[] = [];
    for (const r of arr('practices').map(fix)) {
      const questionId = questionIds.get(str(r.questionId) ?? '');
      if (!questionId) continue;
      const oldSession = str(r.sessionId);
      practices.push({ ...r, id: randomUUID(), questionId, sessionId: oldSession ? (sessionIds.get(oldSession) ?? null) : null, userId });
    }
    const exams: Row[] = [];
    for (const r of arr('exams').map(fix)) {
      const oldId = str(r.id);
      const deckId = deckIds.get(str(r.deckId) ?? '');
      if (!oldId || !deckId) continue;
      const id = randomUUID();
      examIds.set(oldId, id);
      const qids = Array.isArray(r.questionIds) ? (r.questionIds as unknown[]).map((q) => questionIds.get(String(q))).filter((q): q is string => !!q) : [];
      exams.push({ ...r, id, deckId, questionIds: toJson(qids), userId });
    }
    const responses: Row[] = [];
    for (const r of arr('responses').map(fix)) {
      const attemptId = examIds.get(str(r.attemptId) ?? '');
      const questionId = questionIds.get(str(r.questionId) ?? '');
      if (!attemptId || !questionId) continue;
      responses.push({ ...r, id: randomUUID(), attemptId, questionId, userId });
    }
    const settingsRow = arr('settings').map(fix)[0];
    const settings: Row | null = settingsRow ? { ...settingsRow, id: undefined, userId } : null;
    if (settings) delete settings.id;

    const counts: Record<string, number> = {};
    await this.prisma.$transaction(
      async (tx) => {
        // Replace: children first so foreign keys never dangle mid-way.
        await tx.examResponse.deleteMany({ where: { userId } });
        await tx.examAttempt.deleteMany({ where: { userId } });
        await tx.practiceLog.deleteMany({ where: { userId } });
        await tx.questionNote.deleteMany({ where: { userId } });
        await tx.reviewLog.deleteMany({ where: { userId } });
        await tx.studySession.deleteMany({ where: { userId } });
        await tx.cardState.deleteMany({ where: { userId } });
        await tx.questionSubject.deleteMany({ where: { userId } });
        await tx.subject.deleteMany({ where: { userId } });
        await tx.question.deleteMany({ where: { userId } });
        await tx.deck.deleteMany({ where: { userId } });
        await tx.appSettings.deleteMany({ where: { userId } });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insert = async (name: string, model: { createMany: (a: { data: any[] }) => Promise<unknown> }, rows: Row[]) => {
          for (let i = 0; i < rows.length; i += 500) await model.createMany({ data: rows.slice(i, i + 500) });
          counts[name] = rows.length;
        };
        if (settings) await tx.appSettings.create({ data: settings as never });
        counts.settings = settings ? 1 : 0;
        await insert('decks', tx.deck, decks);
        await insert('subjects', tx.subject, subjects);
        await insert('questions', tx.question, questions);
        await insert('questionSubjects', tx.questionSubject, questionSubjects);
        await insert('cards', tx.cardState, cards);
        await insert('sessions', tx.studySession, sessions);
        await insert('reviews', tx.reviewLog, reviews);
        await insert('notes', tx.questionNote, notes);
        await insert('practices', tx.practiceLog, practices);
        await insert('exams', tx.examAttempt, exams);
        await insert('responses', tx.examResponse, responses);
      },
      { timeout: 600_000, maxWait: 10_000 },
    );
    return { restored: true, version, counts };
  }

  async reviewsCsv(userId: string, deckId?: string): Promise<string> {
    const rows = await this.prisma.reviewLog.findMany({
      where: { userId, deletedAt: null, ...(deckId ? { question: { deckId } } : {}) },
      orderBy: { reviewedAt: 'asc' },
      include: { question: { select: { externalId: true, type: true, deck: { select: { slug: true } } } } },
    });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['reviewedAt', 'deckId', 'questionId', 'type', 'rating', 'reviewRound', 'isCorrect', 'elapsedMs', 'revealedBeforeAnswer', 'hintUsed', 'previousStatus', 'undone'];
    const lines = rows.map((r) => [r.reviewedAt.toISOString(), r.question.deck.slug, r.question.externalId, r.question.type, r.rating, r.reviewRound, r.isCorrect, r.elapsedMs, r.revealedBeforeAnswer, r.hintUsed, r.previousStatus, r.undone].map(esc).join(','));
    return [header.join(','), ...lines].join('\n');
  }

  importsForTests() {
    return this.imports;
  }

  json(v: unknown) {
    return toJson(v);
  }
}
