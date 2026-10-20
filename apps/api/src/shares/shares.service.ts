import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION, validateBatch, type Question } from '@recall/contracts';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { toJson } from '../common/json';
import { FsrsService, serializeCard } from '../fsrs/fsrs.service';
import { SubjectsService } from '../subjects/subjects.service';
import { hashesOf } from '../imports/imports.service';
import { CardStatus, Prisma, ShareKind, ShareStatus } from '../generated/prisma/client';
import type { AuthUser } from '../auth/users.service';

export const SHARE_FORMAT = 'recall-studio-share';
export const SHARE_VERSION = 1;
export const SHARE_TTL_DAYS = 30;
export const MAX_RECIPIENTS = 20;
/** Share rows (one per recipient) a sender may create in 24 hours. */
export const MAX_SHARES_PER_DAY = 100;
/** Snapshots live in one JSON column; TiDB caps a row well above this. */
export const MAX_SNAPSHOT_BYTES = 4_000_000;

/** One question as it travels: its payload, the root id it descends from and its extra (manual) subject names. */
export interface SnapshotQuestion {
  originId: string;
  subjects: string[];
  question: Question;
}
export interface SnapshotDeck {
  originId: string;
  slug: string;
  title: string;
  description: string | null;
  subject: string;
  language: string;
  tags: string[];
  questions: SnapshotQuestion[];
}
/** Frozen at send time. Learning state (cards, reviews, notes, flags) is never part of it. */
export interface ShareSnapshot {
  format: typeof SHARE_FORMAT;
  version: typeof SHARE_VERSION;
  kind: ShareKind;
  /** subject name for subject shares */
  subject: string | null;
  decks: SnapshotDeck[];
}

export interface SendInput {
  kind: ShareKind;
  deckId?: string;
  subjectId?: string;
  questionIds?: string[];
  emails: string[];
  message?: string;
  title?: string;
}

export type AcceptStrategy = 'add_only' | 'upsert';
export interface AcceptTarget {
  /** deck index in the snapshot ("0", "1", …) for layout "keep"; "*" for layout "merge" */
  group: string;
  mode: 'new' | 'existing';
  title?: string;
  deckId?: string;
  strategy?: AcceptStrategy;
}
export interface AcceptInput {
  /** question keys `${deckIndex}/${externalId}` to leave out */
  exclude?: string[];
  /** keep = one deck per source deck; merge = everything into one deck */
  layout?: 'keep' | 'merge';
  targets?: AcceptTarget[];
  /** source subject name → name in the recipient's account ('' drops an extra subject) */
  subjectMap?: Record<string, string>;
  /** also bring the sender's extra (manual) subjects; default true */
  extraSubjects?: boolean;
}

export interface AcceptDeckResult {
  id: string;
  title: string;
  isNew: boolean;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** `id` padded with -2, -3, … until it is free; stays within the contract's 80-char id pattern. */
export function freeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const id = `${base.slice(0, 80 - suffix.length)}${suffix}`;
    if (!taken.has(id)) return id;
  }
}

/** Slug candidate from a deck slug or title (Korean titles fall back to "shared-deck"). */
export function slugBase(s: string): string {
  if (SLUG_RE.test(s)) return s;
  const ascii = s.normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^[-_]+|-+$/g, '').slice(0, 72);
  return ascii && SLUG_RE.test(ascii) ? ascii : 'shared-deck';
}

/** Pending shares past their expiry are reported as `expired` (never stored). */
function displayStatus(s: { status: ShareStatus; expiresAt: Date }, now = new Date()) {
  return s.status === ShareStatus.pending && s.expiresAt <= now ? 'expired' : s.status;
}

const LIST_SELECT = {
  id: true,
  kind: true,
  title: true,
  message: true,
  deckCount: true,
  questionCount: true,
  status: true,
  expiresAt: true,
  respondedAt: true,
  resultJson: true,
  createdAt: true,
} as const;

interface Item {
  key: string;
  originId: string;
  question: Question;
  /** source deck subject first, then the extra subjects */
  subjects: string[];
}

@Injectable()
export class SharesService {
  private readonly logger = new Logger(SharesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly fsrs: FsrsService,
    private readonly subjects: SubjectsService,
  ) {}

  // ---------------------------------------------------------------- sending

  async send(user: AuthUser, input: SendInput) {
    const emails = [...new Set(input.emails.map(normalizeEmail).filter(Boolean))];
    if (!emails.length) throw ApiError.badRequest('Enter at least one e-mail address');
    if (emails.length > MAX_RECIPIENTS) throw ApiError.badRequest(`At most ${MAX_RECIPIENTS} recipients per share`);
    const invalid = emails.filter((e) => !EMAIL_RE.test(e) || e.length > 320);
    if (invalid.length) throw ApiError.badRequest(`Invalid e-mail address: ${invalid.join(', ')}`, { invalid });
    if (emails.includes(normalizeEmail(user.email))) throw ApiError.badRequest('You cannot share with yourself');

    const since = new Date(Date.now() - DAY_MS);
    const recent = await this.prisma.share.count({ where: { userId: user.id, createdAt: { gte: since } } });
    if (recent + emails.length > MAX_SHARES_PER_DAY) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', `Daily share limit reached (${MAX_SHARES_PER_DAY} recipients per 24 hours)`);
    }

    const { snapshot, title } = await this.snapshot(user.id, input);
    const questionCount = snapshot.decks.reduce((n, d) => n + d.questions.length, 0);
    if (!questionCount) throw ApiError.badRequest('There is nothing to share (no live questions)');
    const json = toJson(snapshot);
    if (Buffer.byteLength(JSON.stringify(json)) > MAX_SNAPSHOT_BYTES) throw ApiError.badRequest('This share is too large; share fewer questions at a time');

    const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * DAY_MS);
    const finalTitle = (input.title?.trim() || title).slice(0, 200);
    const message = input.message?.trim() || null;
    const rows = emails.map((recipientEmail) => ({
      id: randomUUID(),
      userId: user.id,
      recipientEmail,
      kind: input.kind,
      title: finalTitle,
      message,
      snapshotJson: json,
      deckCount: snapshot.decks.length,
      questionCount,
      expiresAt,
    }));
    await this.prisma.share.createMany({ data: rows });
    this.logger.log(`User ${user.id} shared ${input.kind} "${finalTitle}" (${questionCount} questions) with ${emails.length} recipient(s)`);
    // Same answer whether or not the address has an account (no account enumeration).
    return { sent: emails.length, recipients: emails, title: finalTitle, kind: input.kind, deckCount: snapshot.decks.length, questionCount, expiresAt };
  }

  private async snapshot(userId: string, input: SendInput): Promise<{ snapshot: ShareSnapshot; title: string }> {
    const questionSelect = {
      id: true,
      originId: true,
      deckId: true,
      payloadJson: true,
      subjects: { where: { deletedAt: null, source: 'manual', subject: { deletedAt: null } }, select: { subject: { select: { name: true } } } },
    } as const;
    type Row = Prisma.QuestionGetPayload<{ select: typeof questionSelect }>;
    let rows: Row[];
    let subject: string | null = null;
    let title: string;

    if (input.kind === ShareKind.deck) {
      if (!input.deckId) throw ApiError.badRequest('deckId is required for a deck share');
      const deck = await this.prisma.deck.findFirst({ where: { id: input.deckId, userId, deletedAt: null }, select: { id: true, title: true } });
      if (!deck) throw ApiError.notFound('Deck', input.deckId);
      rows = await this.prisma.question.findMany({ where: { userId, deckId: deck.id, deletedAt: null }, orderBy: { sortIndex: 'asc' }, select: questionSelect });
      title = deck.title;
    } else if (input.kind === ShareKind.subject) {
      if (!input.subjectId) throw ApiError.badRequest('subjectId is required for a subject share');
      const s = await this.prisma.subject.findFirst({ where: { id: input.subjectId, userId, deletedAt: null }, select: { id: true, name: true } });
      if (!s) throw ApiError.notFound('Subject', input.subjectId);
      rows = await this.prisma.question.findMany({
        where: { userId, deletedAt: null, deck: { deletedAt: null }, subjects: { some: { subjectId: s.id, deletedAt: null } } },
        orderBy: [{ deckId: 'asc' }, { sortIndex: 'asc' }],
        select: questionSelect,
      });
      subject = s.name;
      title = s.name;
    } else {
      const ids = [...new Set(input.questionIds ?? [])];
      if (!ids.length) throw ApiError.badRequest('questionIds is required for a question share');
      rows = await this.prisma.question.findMany({ where: { userId, id: { in: ids }, deletedAt: null, deck: { deletedAt: null } }, orderBy: [{ deckId: 'asc' }, { sortIndex: 'asc' }], select: questionSelect });
      if (rows.length !== ids.length) throw ApiError.notFound('Question', ids.find((id) => !rows.some((r) => r.id === id)));
      title = '';
    }

    const deckIds = [...new Set(rows.map((r) => r.deckId))];
    const decks = await this.prisma.deck.findMany({ where: { userId, id: { in: deckIds } } });
    decks.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    const snapDecks: SnapshotDeck[] = decks.map((d) => ({
      originId: d.originId ?? d.id,
      slug: d.slug,
      title: d.title,
      description: d.description,
      subject: d.subject,
      language: d.language,
      tags: d.tagsJson as string[],
      questions: rows
        .filter((r) => r.deckId === d.id)
        .map((r) => ({ originId: r.originId ?? r.id, subjects: r.subjects.map((x) => x.subject.name), question: r.payloadJson as unknown as Question })),
    }));
    if (input.kind === ShareKind.questions) title = snapDecks.length === 1 ? `${snapDecks[0]!.title} · 문항 ${rows.length}개` : `문항 ${rows.length}개`;
    return { snapshot: { format: SHARE_FORMAT, version: SHARE_VERSION, kind: input.kind, subject, decks: snapDecks }, title };
  }

  async sent(userId: string) {
    const rows = await this.prisma.share.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 200, select: { ...LIST_SELECT, recipientEmail: true } });
    const now = new Date();
    return rows.map((r) => ({ ...r, status: displayStatus(r, now) }));
  }

  async cancel(userId: string, id: string) {
    const r = await this.prisma.share.updateMany({ where: { id, userId, status: ShareStatus.pending, deletedAt: null }, data: { status: ShareStatus.canceled, respondedAt: new Date() } });
    if (!r.count) await this.assertExists({ id, userId, deletedAt: null }, 'Share is no longer pending');
    return { canceled: id };
  }

  // -------------------------------------------------------------- receiving

  /** Canceled shares disappear from the inbox; everything else (incl. history) is listed, pending first. */
  async received(user: AuthUser) {
    const rows = await this.prisma.share.findMany({
      where: { recipientEmail: normalizeEmail(user.email), deletedAt: null, status: { not: ShareStatus.canceled } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { ...LIST_SELECT, user: { select: { name: true, email: true } } },
    });
    const now = new Date();
    const out = rows.map(({ user: sender, ...r }) => ({ ...r, sender, status: displayStatus(r, now) }));
    return [...out.filter((r) => r.status === 'pending'), ...out.filter((r) => r.status !== 'pending')];
  }

  async pendingCount(user: AuthUser) {
    const pending = await this.prisma.share.count({ where: { recipientEmail: normalizeEmail(user.email), status: ShareStatus.pending, expiresAt: { gt: new Date() }, deletedAt: null } });
    return { pending };
  }

  /** Full preview for the recipient, with merge hints: decks they already hold copies of, and their subject names. */
  async detail(user: AuthUser, id: string) {
    const share = await this.prisma.share.findFirst({
      where: { id, recipientEmail: normalizeEmail(user.email), deletedAt: null, status: { not: ShareStatus.canceled } },
      select: { ...LIST_SELECT, snapshotJson: true, user: { select: { name: true, email: true } } },
    });
    if (!share) throw ApiError.notFound('Share', id);
    const { snapshotJson, user: sender, ...rest } = share;
    const snapshot = snapshotJson as unknown as ShareSnapshot;
    const origins = snapshot.decks.map((d) => d.originId);
    const [decks, subjects] = await Promise.all([
      this.prisma.deck.findMany({ where: { userId: user.id, deletedAt: null, OR: [{ originId: { in: origins } }, { id: { in: origins } }] }, select: { id: true, title: true, originId: true }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.subject.findMany({ where: { userId: user.id, deletedAt: null }, select: { name: true }, orderBy: { name: 'asc' } }),
    ]);
    const existingDecks: Record<string, { id: string; title: string }> = {};
    for (const d of decks) existingDecks[d.originId ?? d.id] ??= { id: d.id, title: d.title };
    return { ...rest, status: displayStatus(rest), sender, snapshot, suggestions: { decks: existingDecks, subjects: subjects.map((s) => s.name) } };
  }

  async decline(user: AuthUser, id: string) {
    const email = normalizeEmail(user.email);
    const r = await this.prisma.share.updateMany({
      where: { id, recipientEmail: email, status: ShareStatus.pending, deletedAt: null },
      data: { status: ShareStatus.declined, respondedAt: new Date(), recipientId: user.id },
    });
    if (!r.count) await this.assertExists({ id, recipientEmail: email, deletedAt: null, status: { not: ShareStatus.canceled } }, 'Share is no longer pending');
    return { declined: id };
  }

  /**
   * Copy the snapshot into the recipient's account in one transaction. Questions get fresh NEW cards; nothing
   * of the sender's learning state exists in the snapshot. Merging into an existing deck matches questions by
   * origin (the root question id), never by externalId, so an unrelated "q1" of the recipient is never touched.
   */
  async accept(user: AuthUser, id: string, input: AcceptInput) {
    const email = normalizeEmail(user.email);
    const share = await this.prisma.share.findFirst({ where: { id, recipientEmail: email, deletedAt: null, status: { not: ShareStatus.canceled } }, select: { id: true, status: true, expiresAt: true, snapshotJson: true, title: true } });
    if (!share) throw ApiError.notFound('Share', id);
    if (displayStatus(share) !== ShareStatus.pending) throw ApiError.conflict(`Share is ${displayStatus(share)}`);
    const snapshot = share.snapshotJson as unknown as ShareSnapshot;
    if (snapshot.format !== SHARE_FORMAT || snapshot.version !== SHARE_VERSION) throw ApiError.unprocessable('Unsupported share format');

    const plan = this.planGroups(snapshot, input, share.title);
    if (!plan.some((g) => g.items.length)) throw ApiError.badRequest('Select at least one question');
    const map = (name: string) => {
      const m = input.subjectMap?.[name];
      return m === undefined ? name : m.trim();
    };
    const now = new Date();
    const emptyCard = serializeCard(this.fsrs.emptyCard(now));

    const results = await this.prisma.$transaction(
      async (tx) => {
        // Claim first: a second accept (double click, two tabs) finds nothing pending and stops here.
        const claimed = await tx.share.updateMany({
          where: { id, recipientEmail: email, status: ShareStatus.pending, expiresAt: { gt: now }, deletedAt: null },
          data: { status: ShareStatus.accepted, respondedAt: now, recipientId: user.id },
        });
        if (!claimed.count) throw ApiError.conflict('Share is no longer pending');

        const takenSlugs = new Set((await tx.deck.findMany({ where: { userId: user.id }, select: { slug: true } })).map((d) => d.slug));
        const out: AcceptDeckResult[] = [];
        for (const g of plan) {
          if (!g.items.length) continue;
          out.push(await this.writeGroup(tx, user.id, g, { map, extraSubjects: input.extraSubjects !== false, takenSlugs, emptyCard, now }));
        }
        await tx.share.update({ where: { id, recipientEmail: email }, data: { resultJson: toJson({ decks: out }) } });
        return out;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    this.logger.log(`User ${user.id} accepted share ${id}: ${JSON.stringify(results.map(({ title: _t, ...r }) => r))}`);
    return { accepted: id, decks: results };
  }

  /** Turn the snapshot + options into target groups (pure; exported behaviour is covered by unit tests). */
  planGroups(snapshot: ShareSnapshot, input: AcceptInput, shareTitle: string) {
    const exclude = new Set(input.exclude ?? []);
    const layout = snapshot.decks.length > 1 && input.layout === 'merge' ? 'merge' : 'keep';
    const items = (d: SnapshotDeck, i: number): Item[] =>
      d.questions
        .map((q) => ({ key: `${i}/${q.question.id}`, originId: q.originId, question: q.question, subjects: [d.subject, ...q.subjects] }))
        .filter((q) => !exclude.has(q.key));
    const target = (group: string): AcceptTarget => {
      const t = input.targets?.find((x) => x.group === group) ?? { group, mode: 'new' as const };
      if (t.mode === 'existing' && !t.deckId) throw ApiError.badRequest(`Target "${group}" needs a deckId`);
      return t;
    };
    if (layout === 'merge') {
      const first = snapshot.decks[0]!;
      const tags = [...new Set(snapshot.decks.flatMap((d) => d.tags))];
      return [
        {
          target: target('*'),
          deck: { originId: null, slug: slugBase(shareTitle), title: shareTitle, description: null, subject: snapshot.subject ?? first.subject, language: first.language, tags },
          items: snapshot.decks.flatMap(items),
        },
      ];
    }
    return snapshot.decks.map((d, i) => ({
      target: target(String(i)),
      deck: { originId: d.originId as string | null, slug: d.slug, title: d.title, description: d.description, subject: d.subject, language: d.language, tags: d.tags },
      items: items(d, i),
    }));
  }

  private async writeGroup(
    tx: Tx,
    userId: string,
    g: ReturnType<SharesService['planGroups']>[number],
    ctx: { map: (name: string) => string; extraSubjects: boolean; takenSlugs: Set<string>; emptyCard: ReturnType<typeof serializeCard>; now: Date },
  ): Promise<AcceptDeckResult> {
    const { target } = g;
    const strategy: AcceptStrategy = target.strategy ?? 'add_only';
    let deck: { id: string; title: string; subject: string; language: string; tags: string[] };
    let isNew = false;
    if (target.mode === 'existing') {
      const d = await tx.deck.findFirst({ where: { id: target.deckId!, userId, deletedAt: null }, select: { id: true, title: true, subject: true, language: true, tagsJson: true } });
      if (!d) throw ApiError.notFound('Deck', target.deckId);
      deck = { ...d, tags: d.tagsJson as string[] };
    } else {
      const title = (target.title?.trim() || g.deck.title).slice(0, 200);
      const subject = ctx.map(g.deck.subject) || g.deck.subject;
      const slug = freeId(slugBase(g.deck.slug), ctx.takenSlugs);
      ctx.takenSlugs.add(slug);
      deck = await tx.deck
        .create({
          data: { userId, slug, title, description: g.deck.description, subject, language: g.deck.language, tagsJson: toJson(g.deck.tags), originId: g.deck.originId },
          select: { id: true, title: true, subject: true, language: true },
        })
        .then((d) => ({ ...d, tags: g.deck.tags }));
      isNew = true;
    }

    const existing = await tx.question.findMany({ where: { userId, deckId: deck.id }, select: { id: true, externalId: true, originId: true, contentHash: true, answerHash: true, deletedAt: true, sortIndex: true } });
    const byOrigin = new Map(existing.map((e) => [e.originId ?? e.id, e]));
    const takenExt = new Set(existing.map((e) => e.externalId));
    let sortIndex = existing.reduce((m, e) => Math.max(m, e.sortIndex + 1), 0);

    // Decide every row first, then validate the questions exactly as they will be stored.
    type Op = { kind: 'create' | 'update' | 'revive' | 'unchanged' | 'skip'; item: Item; question: Question; prevId?: string; reset?: boolean };
    const ops: Op[] = [];
    for (const item of g.items) {
      const prev = byOrigin.get(item.originId);
      if (prev && !prev.deletedAt && strategy === 'add_only') {
        ops.push({ kind: 'skip', item, question: item.question, prevId: prev.id });
        continue;
      }
      if (prev) {
        const question = { ...item.question, id: prev.externalId } as Question;
        const h = hashesOf(question);
        if (prev.deletedAt) ops.push({ kind: 'revive', item, question, prevId: prev.id, reset: prev.answerHash !== h.answerHash });
        else if (prev.contentHash === h.contentHash) ops.push({ kind: 'unchanged', item, question, prevId: prev.id });
        else ops.push({ kind: 'update', item, question, prevId: prev.id, reset: prev.answerHash !== h.answerHash });
        continue;
      }
      const ext = freeId(item.question.id, takenExt);
      takenExt.add(ext);
      byOrigin.set(item.originId, { id: '', externalId: ext, originId: item.originId, contentHash: '', answerHash: '', deletedAt: null, sortIndex: 0 });
      ops.push({ kind: 'create', item, question: { ...item.question, id: ext } as Question });
    }
    const written = ops.filter((o) => o.kind !== 'skip' && o.kind !== 'unchanged');
    if (written.length) {
      const v = validateBatch({
        schemaVersion: SCHEMA_VERSION,
        deck: { id: 'shared', title: deck.title, subject: deck.subject, language: deck.language, tags: deck.tags },
        questions: written.map((o) => o.question),
      });
      if (!v.ok) throw ApiError.unprocessable('Shared questions failed validation; nothing was imported', { issues: v.issues });
    }

    const creates: Prisma.QuestionCreateManyInput[] = [];
    const cardCreates: Prisma.CardStateCreateManyInput[] = [];
    const touched: { id: string; item: Item }[] = [];
    const resetCard = { stateJson: toJson(ctx.emptyCard), dueAt: ctx.now, status: CardStatus.NEW, stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReviewAt: null, version: { increment: 1 } };
    for (const op of ops) {
      if (op.kind === 'create') {
        const id = randomUUID();
        const h = hashesOf(op.question);
        creates.push({ id, userId, externalId: op.question.id, deckId: deck.id, type: op.question.type, payloadJson: toJson(op.question), contentHash: h.contentHash, answerHash: h.answerHash, revision: 1, sortIndex: sortIndex++, originId: op.item.originId });
        cardCreates.push({ questionId: id, userId, stateJson: toJson(ctx.emptyCard), dueAt: ctx.now, status: CardStatus.NEW, version: 0 });
        touched.push({ id, item: op.item });
      } else if (op.kind === 'update' || op.kind === 'revive') {
        const h = hashesOf(op.question);
        await tx.question.update({
          where: { id: op.prevId!, userId },
          data: { payloadJson: toJson(op.question), contentHash: h.contentHash, answerHash: h.answerHash, type: op.question.type, deletedAt: null, ...(op.kind === 'update' ? { revision: { increment: 1 } } : {}) },
        });
        if (op.reset) {
          await tx.cardState.upsert({
            where: { questionId: op.prevId!, userId },
            create: { questionId: op.prevId!, userId, stateJson: toJson(ctx.emptyCard), dueAt: ctx.now, status: CardStatus.NEW, version: 0 },
            update: resetCard,
          });
        }
        touched.push({ id: op.prevId!, item: op.item });
      }
    }
    if (creates.length) {
      await tx.question.createMany({ data: creates });
      await tx.cardState.createMany({ data: cardCreates });
    }

    // Subjects: the target deck's subject as the deck link; the rest (mapped) as extra links.
    const ids = touched.map((t) => t.id);
    await this.subjects.assignDeckSubject(tx, userId, ids, deck.subject);
    if (ctx.extraSubjects) {
      const byName = new Map<string, string[]>();
      for (const t of touched) {
        for (const name of new Set(t.item.subjects.map(ctx.map))) {
          if (!name || name === deck.subject) continue;
          byName.set(name, [...(byName.get(name) ?? []), t.id]);
        }
      }
      for (const [name, qids] of byName) await this.subjects.assignDeckSubject(tx, userId, qids, name, 'manual');
    }

    const count = (k: Op['kind']) => ops.filter((o) => o.kind === k).length;
    return { id: deck.id, title: deck.title, isNew, created: count('create'), updated: count('update') + count('revive'), unchanged: count('unchanged'), skipped: count('skip') };
  }

  private async assertExists(where: Prisma.ShareWhereInput, conflictMessage: string): Promise<never> {
    const exists = await this.prisma.share.count({ where });
    throw exists ? ApiError.conflict(conflictMessage) : ApiError.notFound('Share', typeof where.id === 'string' ? where.id : undefined);
  }
}
