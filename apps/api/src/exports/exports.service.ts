import { Injectable } from '@nestjs/common';
import { SCHEMA_VERSION, validateBatch, type Question, type QuestionBatch } from '@recall/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { toJson } from '../common/json';
import { ImportsService } from '../imports/imports.service';

/** Portable exports: a deck back into the question-batch contract, and a full JSON backup. */
@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: ImportsService,
  ) {}

  /** Re-export a deck as a schema-valid question batch (re-importable anywhere). */
  async deckBatch(deckId: string): Promise<QuestionBatch> {
    const deck = await this.prisma.deck.findFirst({ where: { id: deckId, deletedAt: null }, include: { questions: { where: { deletedAt: null }, orderBy: { sortIndex: 'asc' } } } });
    if (!deck) throw ApiError.notFound('Deck', deckId);
    const batch: QuestionBatch = {
      schemaVersion: SCHEMA_VERSION,
      deck: { id: deck.id, title: deck.title, ...(deck.description ? { description: deck.description } : {}), subject: deck.subject, language: deck.language, tags: deck.tagsJson as string[] },
      questions: deck.questions.map((q) => q.payloadJson as unknown as Question),
    };
    const v = validateBatch(batch);
    if (!v.ok) throw ApiError.conflict('Stored deck no longer validates against the schema', { issues: v.issues });
    return batch;
  }

  async backup() {
    const [decks, questions, cards, reviews, notes, sessions, practices, exams, responses, settings, subjects, questionSubjects] = await Promise.all([
      this.prisma.deck.findMany(),
      this.prisma.question.findMany(),
      this.prisma.cardState.findMany(),
      this.prisma.reviewLog.findMany(),
      this.prisma.questionNote.findMany(),
      this.prisma.studySession.findMany(),
      this.prisma.practiceLog.findMany(),
      this.prisma.examAttempt.findMany(),
      this.prisma.examResponse.findMany(),
      this.prisma.appSettings.findMany(),
      this.prisma.subject.findMany(),
      this.prisma.questionSubject.findMany(),
    ]);
    return { format: 'recall-studio-backup', version: 1, exportedAt: new Date().toISOString(), decks, questions, cards, reviews, notes, sessions, practices, exams, responses, settings, subjects, questionSubjects };
  }

  /** Restore a backup into an EMPTY database (refuses when decks already exist unless `force`). */
  async restore(payload: Record<string, unknown>, force = false) {
    if (payload.format !== 'recall-studio-backup' || payload.version !== 1) throw ApiError.badRequest('Not a Recall Studio v1 backup file');
    const existing = await this.prisma.deck.count();
    if (existing > 0 && !force) throw ApiError.conflict('Database already contains decks. Pass force=true to merge (existing rows with the same ids are overwritten).');
    const arr = (k: string) => (Array.isArray(payload[k]) ? (payload[k] as Record<string, unknown>[]) : []);
    const fix = (row: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) out[k] = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) && /At$|^due|Until$/.test(k) ? new Date(v) : v;
      return out;
    };
    const counts: Record<string, number> = {};
    await this.prisma.$transaction(
      async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upsertAll = async (name: string, model: any, rows: Record<string, unknown>[], key: (r: Record<string, unknown>) => Record<string, unknown>) => {
          for (const r of rows) {
            const data = fix(r);
            await model.upsert({ where: key(data), create: data, update: data });
          }
          counts[name] = rows.length;
        };
        await upsertAll('settings', tx.appSettings, arr('settings'), (r) => ({ id: r.id }));
        await upsertAll('decks', tx.deck, arr('decks'), (r) => ({ id: r.id }));
        await upsertAll('subjects', tx.subject, arr('subjects'), (r) => ({ id: r.id }));
        await upsertAll('questions', tx.question, arr('questions'), (r) => ({ id: r.id }));
        await upsertAll('questionSubjects', tx.questionSubject, arr('questionSubjects'), (r) => ({ questionId_subjectId: { questionId: r.questionId, subjectId: r.subjectId } }));
        await upsertAll('cards', tx.cardState, arr('cards'), (r) => ({ questionId: r.questionId }));
        await upsertAll('sessions', tx.studySession, arr('sessions'), (r) => ({ id: r.id }));
        await upsertAll('reviews', tx.reviewLog, arr('reviews'), (r) => ({ id: r.id }));
        await upsertAll('notes', tx.questionNote, arr('notes'), (r) => ({ id: r.id }));
        await upsertAll('practices', tx.practiceLog, arr('practices'), (r) => ({ id: r.id }));
        await upsertAll('exams', tx.examAttempt, arr('exams'), (r) => ({ id: r.id }));
        await upsertAll('responses', tx.examResponse, arr('responses'), (r) => ({ id: r.id }));
      },
      { timeout: 600_000, maxWait: 10_000 },
    );
    return { restored: true, counts };
  }

  async reviewsCsv(deckId?: string): Promise<string> {
    const rows = await this.prisma.reviewLog.findMany({
      where: { deletedAt: null, ...(deckId ? { question: { deckId } } : {}) },
      orderBy: { reviewedAt: 'asc' },
      include: { question: { select: { externalId: true, deckId: true, type: true } } },
    });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['reviewedAt', 'deckId', 'questionId', 'type', 'rating', 'reviewRound', 'isCorrect', 'elapsedMs', 'revealedBeforeAnswer', 'hintUsed', 'previousStatus', 'undone'];
    const lines = rows.map((r) => [r.reviewedAt.toISOString(), r.question.deckId, r.question.externalId, r.question.type, r.rating, r.reviewRound, r.isCorrect, r.elapsedMs, r.revealedBeforeAnswer, r.hintUsed, r.previousStatus, r.undone].map(esc).join(','));
    return [header.join(','), ...lines].join('\n');
  }

  importsForTests() {
    return this.imports;
  }

  json(v: unknown) {
    return toJson(v);
  }
}
