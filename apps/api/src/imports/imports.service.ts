import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  answerSignature,
  canonicalJson,
  validateBatch,
  type Question,
  type QuestionBatch,
  type QuestionType,
  type ValidationIssue,
} from '@recall/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { toJson } from '../common/json';
import { FsrsService, serializeCard } from '../fsrs/fsrs.service';
import { SubjectsService } from '../subjects/subjects.service';
import { CardStatus, Prisma } from '../generated/prisma/client';
import type { ImportStrategy } from './imports.dto';

type Op = 'create' | 'update' | 'unchanged' | 'reactivate' | 'skip_existing';

export interface ImportPlanItem {
  externalId: string;
  type: QuestionType;
  op: Op;
  resetSchedule: boolean;
  reason?: string;
}

export interface ImportPlan {
  ok: boolean;
  issues: ValidationIssue[];
  summary?: { deckId: string; title: string; total: number; byType: Record<QuestionType, number> };
  deck?: { id: string; exists: boolean; currentTitle?: string; newTitle: string };
  strategy: ImportStrategy;
  counts: { created: number; updated: number; unchanged: number; resetSchedule: number; deactivated: number; skipped: number };
  items: ImportPlanItem[];
  deactivate: string[];
}

export interface ImportReport extends ImportPlan {
  committed: boolean;
  deckId?: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function hashesOf(q: Question) {
  return { contentHash: sha256(canonicalJson(q)), answerHash: sha256(canonicalJson(answerSignature(q))) };
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly fsrs: FsrsService,
    private readonly subjects: SubjectsService,
  ) {}

  /** Dry run: schema + semantic validation, plus the diff against the database. */
  async plan(input: unknown, strategy: ImportStrategy = 'upsert'): Promise<ImportPlan> {
    const v = validateBatch(input);
    const base: ImportPlan = {
      ok: false,
      issues: v.issues,
      summary: v.summary,
      strategy,
      counts: { created: 0, updated: 0, unchanged: 0, resetSchedule: 0, deactivated: 0, skipped: 0 },
      items: [],
      deactivate: [],
    };
    if (!v.ok || !v.batch) return base;
    const batch = v.batch;
    const deck = await this.prisma.deck.findFirst({ where: { id: batch.deck.id, deletedAt: null }, select: { id: true, title: true } });
    const existing = await this.prisma.question.findMany({
      where: { deckId: batch.deck.id },
      select: { externalId: true, contentHash: true, answerHash: true, deletedAt: true },
    });
    const byExt = new Map(existing.map((e) => [e.externalId, e]));
    const items: ImportPlanItem[] = [];
    const counts = { created: 0, updated: 0, unchanged: 0, resetSchedule: 0, deactivated: 0, skipped: 0 };
    const seen = new Set<string>();
    for (const q of batch.questions) {
      seen.add(q.id);
      const h = hashesOf(q);
      const prev = byExt.get(q.id);
      if (!prev) {
        items.push({ externalId: q.id, type: q.type, op: 'create', resetSchedule: false });
        counts.created++;
        continue;
      }
      if (strategy === 'add_only' && !prev.deletedAt) {
        items.push({ externalId: q.id, type: q.type, op: 'skip_existing', resetSchedule: false, reason: 'add_only strategy keeps existing questions untouched' });
        counts.skipped++;
        continue;
      }
      if (prev.contentHash === h.contentHash) {
        if (prev.deletedAt) {
          items.push({ externalId: q.id, type: q.type, op: 'reactivate', resetSchedule: false });
          counts.updated++;
        } else {
          items.push({ externalId: q.id, type: q.type, op: 'unchanged', resetSchedule: false });
          counts.unchanged++;
        }
        continue;
      }
      const reset = prev.answerHash !== h.answerHash;
      items.push({
        externalId: q.id,
        type: q.type,
        op: 'update',
        resetSchedule: reset,
        reason: reset ? 'answer key changed → scheduling reset, review history kept' : 'content changed (answer unchanged) → scheduling preserved',
      });
      counts.updated++;
      if (reset) counts.resetSchedule++;
    }
    const deactivate = strategy === 'replace_deck' ? existing.filter((e) => !e.deletedAt && !seen.has(e.externalId)).map((e) => e.externalId) : [];
    counts.deactivated = deactivate.length;
    return {
      ...base,
      ok: true,
      deck: { id: batch.deck.id, exists: !!deck, currentTitle: deck?.title, newTitle: batch.deck.title },
      counts,
      items,
      deactivate,
    };
  }

  /** Atomic commit: one invalid question → nothing is written. */
  async commit(input: unknown, strategy: ImportStrategy = 'upsert'): Promise<ImportReport> {
    const plan = await this.plan(input, strategy);
    if (!plan.ok) throw ApiError.unprocessable('Batch failed validation; nothing was imported', { issues: plan.issues });
    const batch = input as QuestionBatch;
    const now = new Date();
    const emptyCard = serializeCard(this.fsrs.emptyCard(now));

    await this.prisma.$transaction(
      async (tx) => {
        await tx.deck.upsert({
          where: { id: batch.deck.id },
          create: {
            id: batch.deck.id,
            title: batch.deck.title,
            description: batch.deck.description ?? null,
            subject: batch.deck.subject,
            language: batch.deck.language,
            tagsJson: toJson(batch.deck.tags),
          },
          update: {
            title: batch.deck.title,
            description: batch.deck.description ?? null,
            subject: batch.deck.subject,
            language: batch.deck.language,
            tagsJson: toJson(batch.deck.tags),
            deletedAt: null,
          },
        });
        const existing = await tx.question.findMany({ where: { deckId: batch.deck.id }, select: { id: true, externalId: true, sortIndex: true } });
        const byExt = new Map(existing.map((e) => [e.externalId, e]));
        const opByExt = new Map(plan.items.map((i) => [i.externalId, i]));

        const creates: Prisma.QuestionCreateManyInput[] = [];
        const cardCreates: Prisma.CardStateCreateManyInput[] = [];
        let sortIndex = 0;
        for (const q of batch.questions) {
          const op = opByExt.get(q.id)!;
          const h = hashesOf(q);
          const prev = byExt.get(q.id);
          if (op.op === 'create') {
            const id = randomUUID();
            creates.push({ id, externalId: q.id, deckId: batch.deck.id, type: q.type, payloadJson: toJson(q), contentHash: h.contentHash, answerHash: h.answerHash, revision: 1, sortIndex });
            cardCreates.push({ questionId: id, stateJson: toJson(emptyCard), dueAt: now, status: CardStatus.NEW, version: 0 });
          } else if (op.op === 'update' || op.op === 'reactivate') {
            await tx.question.update({
              where: { id: prev!.id },
              data: {
                payloadJson: toJson(q),
                contentHash: h.contentHash,
                answerHash: h.answerHash,
                type: q.type,
                sortIndex,
                deletedAt: null,
                ...(op.op === 'update' ? { revision: { increment: 1 } } : {}),
              },
            });
            if (op.resetSchedule) {
              await tx.cardState.upsert({
                where: { questionId: prev!.id },
                create: { questionId: prev!.id, stateJson: toJson(emptyCard), dueAt: now, status: CardStatus.NEW, version: 0 },
                update: { stateJson: toJson(emptyCard), dueAt: now, status: CardStatus.NEW, stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReviewAt: null, version: { increment: 1 } },
              });
            }
          } else if (op.op === 'unchanged' && prev && prev.sortIndex !== sortIndex) {
            await tx.question.update({ where: { id: prev.id }, data: { sortIndex } });
          }
          sortIndex++;
        }
        if (creates.length) {
          await tx.question.createMany({ data: creates });
          await tx.cardState.createMany({ data: cardCreates });
        }
        if (plan.deactivate.length) {
          await tx.question.updateMany({ where: { deckId: batch.deck.id, externalId: { in: plan.deactivate } }, data: { deletedAt: now } });
        }
        // Subject classification: every live question of the deck belongs to the deck's subject.
        const live = await tx.question.findMany({ where: { deckId: batch.deck.id, deletedAt: null }, select: { id: true } });
        await this.subjects.assignDeckSubject(tx, live.map((q) => q.id), batch.deck.subject);
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    this.logger.log(`Imported deck ${batch.deck.id}: ${JSON.stringify(plan.counts)}`);
    return { ...plan, committed: true, deckId: batch.deck.id };
  }
}
