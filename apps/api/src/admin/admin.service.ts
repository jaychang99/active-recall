/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { answerSignature, canonicalJson, validateBatchSchema, validateQuestionSemantics, type Question } from '@recall/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/api-error';
import { toJson } from '../common/json';
import { FsrsService, serializeCard } from '../fsrs/fsrs.service';
import { ENTITIES, ENTITY_BY_KEY, type EntityMeta, type FieldMeta } from './entities';
import { CardStatus, Prisma } from '../generated/prisma/client';

export interface ListQuery {
  page: number;
  pageSize: number;
  sort?: string;
  dir?: 'asc' | 'desc';
  search?: string;
  /** JSON object: { field: value | { min, max } | { from, to } | { in: [...] } } */
  filters?: Record<string, unknown>;
  deleted: 'live' | 'deleted' | 'all';
}

export type BulkAction = 'delete' | 'restore' | 'permanent' | 'patch';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fsrs: FsrsService,
  ) {}

  entities() {
    return ENTITIES;
  }

  meta(key: string): EntityMeta {
    const m = ENTITY_BY_KEY.get(key);
    if (!m) throw ApiError.notFound('Entity', key);
    return m;
  }

  private delegate(meta: EntityMeta): any {
    return (this.prisma as any)[meta.model];
  }

  /** The settings singleton is created lazily elsewhere; make sure it exists before admin access. */
  private async ensureSingleton(meta: EntityMeta) {
    if (meta.key !== 'settings') return;
    const row = await this.prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!row) await this.prisma.appSettings.create({ data: { id: 1 } }).catch(() => undefined);
  }

  private field(meta: EntityMeta, name: string): FieldMeta | undefined {
    return meta.fields.find((f) => f.name === name);
  }

  /** Composite keys are passed as "a:b" (QuestionSubject = questionId:subjectId). */
  private whereUnique(meta: EntityMeta, id: string): Record<string, unknown> {
    if (meta.key === 'question-subjects') {
      const [questionId, subjectId] = id.split(':');
      if (!questionId || !subjectId) throw ApiError.badRequest('id must be "questionId:subjectId"');
      return { questionId_subjectId: { questionId, subjectId } };
    }
    if (meta.key === 'settings') return { id: Number(id) };
    return { [meta.pk]: id };
  }

  private coerce(f: FieldMeta, v: unknown): unknown {
    if (v === null || v === undefined) return v;
    switch (f.type) {
      case 'number': {
        const n = Number(v);
        if (Number.isNaN(n)) throw ApiError.badRequest(`${f.name} must be a number`);
        return n;
      }
      case 'boolean':
        return v === true || v === 'true' || v === 1 || v === '1';
      case 'datetime': {
        if (v === '') return null;
        const d = new Date(String(v));
        if (Number.isNaN(d.getTime())) throw ApiError.badRequest(`${f.name} must be an ISO datetime`);
        return d;
      }
      case 'json':
        if (typeof v === 'string') {
          try {
            return JSON.parse(v);
          } catch {
            throw ApiError.badRequest(`${f.name} must be valid JSON`);
          }
        }
        return v;
      case 'enum':
        if (!f.enumValues?.includes(String(v))) throw ApiError.badRequest(`${f.name} must be one of ${f.enumValues?.join(', ')}`);
        return String(v);
      default:
        return String(v);
    }
  }

  private buildWhere(meta: EntityMeta, q: ListQuery): Record<string, unknown> {
    const and: Record<string, unknown>[] = [];
    if (meta.softDelete) {
      if (q.deleted === 'live') and.push({ deletedAt: null });
      else if (q.deleted === 'deleted') and.push({ deletedAt: { not: null } });
    }
    if (q.search?.trim()) {
      const s = q.search.trim();
      const or = meta.fields.filter((f) => f.searchable).map((f) => ({ [f.name]: { contains: s } }));
      if (or.length) and.push({ OR: or });
    }
    for (const [name, raw] of Object.entries(q.filters ?? {})) {
      const f = this.field(meta, name);
      if (!f || !f.filterable || raw === undefined || raw === null || raw === '') continue;
      if (typeof raw === 'object' && !Array.isArray(raw)) {
        const o = raw as Record<string, unknown>;
        if (Array.isArray(o.in)) { and.push({ [name]: { in: o.in.map((x) => this.coerce(f, x)) } }); continue; }
        const range: Record<string, unknown> = {};
        if (o.min !== undefined && o.min !== '') range.gte = this.coerce(f, o.min);
        if (o.max !== undefined && o.max !== '') range.lte = this.coerce(f, o.max);
        if (o.from !== undefined && o.from !== '') range.gte = this.coerce(f, o.from);
        if (o.to !== undefined && o.to !== '') range.lte = this.coerce(f, o.to);
        if (o.contains !== undefined && o.contains !== '') and.push({ [name]: { contains: String(o.contains) } });
        if (o.isNull === true) and.push({ [name]: null });
        if (o.isNull === false) and.push({ [name]: { not: null } });
        if (Object.keys(range).length) and.push({ [name]: range });
        continue;
      }
      if (f.type === 'string' || f.type === 'text') and.push(f.ref ? { [name]: String(raw) } : { [name]: { contains: String(raw) } });
      else and.push({ [name]: this.coerce(f, raw) });
    }
    return and.length ? { AND: and } : {};
  }

  async list(key: string, q: ListQuery) {
    const meta = this.meta(key);
    await this.ensureSingleton(meta);
    const where = this.buildWhere(meta, q);
    const sortField = q.sort && this.field(meta, q.sort)?.sortable ? q.sort : meta.defaultSort.field;
    const dir = q.dir ?? (sortField === meta.defaultSort.field ? meta.defaultSort.dir : 'asc');
    const d = this.delegate(meta);
    const [total, items] = await Promise.all([
      d.count({ where }),
      d.findMany({ where, orderBy: { [sortField]: dir }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, ...(meta.display ? { include: meta.display } : {}) }),
    ]);
    return { entity: meta.key, page: q.page, pageSize: q.pageSize, total, sort: sortField, dir, items: items.map((r: any) => this.decorate(meta, r)) };
  }

  private decorate(meta: EntityMeta, row: any) {
    const id = meta.key === 'question-subjects' ? `${row.questionId}:${row.subjectId}` : String(row[meta.pk]);
    const label = this.labelOf(meta, row);
    return { ...row, _id: id, _label: label };
  }

  private labelOf(meta: EntityMeta, row: any): string {
    switch (meta.key) {
      case 'decks': return row.title;
      case 'questions': return `${row.externalId} · ${(row.payloadJson as Question | undefined)?.prompt?.slice(0, 80) ?? ''}`;
      case 'cards': return `${row.question?.externalId ?? row.questionId} · ${row.status}`;
      case 'reviews': return `${row.question?.externalId ?? row.questionId} · ${row.reviewRound}회차 · ${['', 'Again', 'Hard', 'Good', 'Easy'][row.rating] ?? row.rating}`;
      case 'notes': return `${row.question?.externalId ?? row.questionId} · ${row.reviewRound}회차`;
      case 'subjects': return row.name;
      case 'question-subjects': return `${row.question?.externalId ?? row.questionId} ↔ ${row.subject?.name ?? row.subjectId}`;
      case 'sessions': return `${row.deck?.title ?? row.scope} · ${row.mode}`;
      case 'practice': return `${row.question?.externalId ?? row.questionId}`;
      case 'exams': return row.title;
      case 'exam-responses': return `${row.question?.externalId ?? row.questionId}`;
      case 'settings': return '설정';
      default: return String(row[meta.pk]);
    }
  }

  async get(key: string, id: string) {
    const meta = this.meta(key);
    await this.ensureSingleton(meta);
    const row = await this.delegate(meta).findUnique({ where: this.whereUnique(meta, id), ...(meta.display ? { include: meta.display } : {}) });
    if (!row) throw ApiError.notFound(meta.label, id);
    return this.decorate(meta, row);
  }

  /** Pick + coerce editable (or, on create, required/editable) fields. */
  private pickData(meta: EntityMeta, data: Record<string, unknown>, mode: 'create' | 'update'): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of meta.fields) {
      const allowed = mode === 'create' ? f.editable || f.required || f.name === meta.pk : f.editable;
      if (!allowed || !(f.name in data)) continue;
      out[f.name] = this.coerce(f, data[f.name]);
    }
    if (mode === 'create') for (const f of meta.fields) if (f.required && (out[f.name] === undefined || out[f.name] === null || out[f.name] === '')) throw ApiError.badRequest(`${f.label} (${f.name}) is required`);
    return out;
  }

  /** Validate a single question payload against the schema + semantic rules. */
  private validateQuestionPayload(payload: unknown): Question {
    const probe = { schemaVersion: '1.0.0', deck: { id: 'probe', title: 'probe', subject: 'probe', language: 'ko', tags: [] }, questions: [payload] };
    const r = validateBatchSchema(probe);
    if (!r.ok) throw ApiError.unprocessable('Question payload failed schema validation', { issues: r.issues });
    const q = payload as Question;
    const sem = validateQuestionSemantics(q, 0);
    if (sem.length) throw ApiError.unprocessable('Question payload failed semantic validation', { issues: sem });
    return q;
  }

  async create(key: string, data: Record<string, unknown>) {
    const meta = this.meta(key);
    if (!meta.creatable) throw ApiError.badRequest(`${meta.label} cannot be created here`);
    const d = this.delegate(meta);
    if (meta.key === 'questions') {
      const q = this.validateQuestionPayload(data.payloadJson);
      const deckId = String(data.deckId ?? '');
      const deck = await this.prisma.deck.findFirst({ where: { id: deckId, deletedAt: null } });
      if (!deck) throw ApiError.notFound('Deck', deckId);
      const dup = await this.prisma.question.findUnique({ where: { deckId_externalId: { deckId, externalId: q.id } } });
      if (dup) throw ApiError.conflict(`Question "${q.id}" already exists in deck ${deckId}`);
      const max = await this.prisma.question.aggregate({ where: { deckId }, _max: { sortIndex: true } });
      const now = new Date();
      const row = await this.prisma.question.create({
        data: {
          deckId, externalId: q.id, type: q.type, payloadJson: toJson(q), contentHash: sha256(canonicalJson(q)), answerHash: sha256(canonicalJson(answerSignature(q))),
          sortIndex: (max._max.sortIndex ?? -1) + 1,
          card: { create: { stateJson: toJson(serializeCard(this.fsrs.emptyCard(now))), dueAt: now, status: CardStatus.NEW } },
        },
      });
      return this.get(key, row.id);
    }
    const payload = this.pickData(meta, data, 'create');
    if (meta.key === 'decks') {
      if (payload.tagsJson === undefined) payload.tagsJson = [];
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(String(payload.id))) throw ApiError.badRequest('deck id must match ^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$');
    }
    if (meta.key === 'notes') {
      const exists = await this.prisma.questionNote.findUnique({ where: { questionId_reviewRound: { questionId: String(payload.questionId), reviewRound: Number(payload.reviewRound) } } });
      if (exists) throw ApiError.conflict('A note for this question and round already exists (edit it instead)');
    }
    try {
      const row = await d.create({ data: payload });
      return this.get(key, meta.key === 'question-subjects' ? `${row.questionId}:${row.subjectId}` : String(row[meta.pk]));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw ApiError.conflict('A record with the same unique key already exists');
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') throw ApiError.badRequest('A referenced record does not exist');
      throw e;
    }
  }

  async update(key: string, id: string, data: Record<string, unknown>) {
    const meta = this.meta(key);
    await this.ensureSingleton(meta);
    const d = this.delegate(meta);
    const where = this.whereUnique(meta, id);
    const current = await d.findUnique({ where });
    if (!current) throw ApiError.notFound(meta.label, id);
    const payload = this.pickData(meta, data, 'update');
    if (meta.key === 'questions' && payload.payloadJson !== undefined) {
      const q = this.validateQuestionPayload(payload.payloadJson);
      if (q.id !== current.externalId) {
        const dup = await this.prisma.question.findUnique({ where: { deckId_externalId: { deckId: current.deckId, externalId: q.id } } });
        if (dup && dup.id !== current.id) throw ApiError.conflict(`Question "${q.id}" already exists in this deck`);
      }
      const contentHash = sha256(canonicalJson(q));
      const answerHash = sha256(canonicalJson(answerSignature(q)));
      const answerChanged = answerHash !== current.answerHash;
      const row = await this.prisma.$transaction(async (tx) => {
        const r = await tx.question.update({ where: { id: current.id }, data: { ...payload, payloadJson: toJson(q), externalId: q.id, type: q.type, contentHash, answerHash, ...(contentHash !== current.contentHash ? { revision: { increment: 1 } } : {}) } });
        if (answerChanged) {
          const now = new Date();
          await tx.cardState.upsert({
            where: { questionId: current.id },
            create: { questionId: current.id, stateJson: toJson(serializeCard(this.fsrs.emptyCard(now))), dueAt: now, status: CardStatus.NEW },
            update: { stateJson: toJson(serializeCard(this.fsrs.emptyCard(now))), dueAt: now, status: CardStatus.NEW, stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReviewAt: null, version: { increment: 1 } },
          });
        }
        return r;
      });
      return { ...(await this.get(key, row.id)), resetSchedule: answerChanged };
    }
    if (meta.key === 'cards') payload.version = { increment: 1 };
    if (meta.key === 'subjects' && payload.name !== undefined) {
      const clash = await this.prisma.subject.findUnique({ where: { name: String(payload.name) } });
      if (clash && clash.id !== id) throw ApiError.conflict(`Subject "${String(payload.name)}" already exists`);
    }
    if (meta.key === 'settings' && payload.timezone !== undefined) {
      try { new Intl.DateTimeFormat('en-US', { timeZone: String(payload.timezone) }); } catch { throw ApiError.badRequest('invalid timezone'); }
    }
    await d.update({ where, data: payload });
    return this.get(key, id);
  }

  async remove(key: string, id: string, permanent = false) {
    const meta = this.meta(key);
    if (meta.key === 'settings') throw ApiError.badRequest('Settings cannot be deleted');
    const d = this.delegate(meta);
    const where = this.whereUnique(meta, id);
    const current = await d.findUnique({ where });
    if (!current) throw ApiError.notFound(meta.label, id);
    if (permanent || !meta.softDelete) {
      await d.delete({ where });
      return { id, deleted: true, permanent: true };
    }
    await d.update({ where, data: { deletedAt: new Date() } });
    return { id, deleted: true, permanent: false };
  }

  async restore(key: string, id: string) {
    const meta = this.meta(key);
    if (!meta.softDelete) throw ApiError.badRequest(`${meta.label} has no soft delete`);
    const d = this.delegate(meta);
    const where = this.whereUnique(meta, id);
    const current = await d.findUnique({ where });
    if (!current) throw ApiError.notFound(meta.label, id);
    await d.update({ where, data: { deletedAt: null } });
    return this.get(key, id);
  }

  async bulk(key: string, ids: string[], action: BulkAction, data?: Record<string, unknown>) {
    const meta = this.meta(key);
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        if (action === 'delete') await this.remove(key, id, false);
        else if (action === 'permanent') await this.remove(key, id, true);
        else if (action === 'restore') await this.restore(key, id);
        else if (action === 'patch') await this.update(key, id, data ?? {});
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: (e as Error).message });
      }
    }
    return { entity: meta.key, action, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  }

  /** Lightweight option lists for reference fields (id + label). */
  async options(key: string, search?: string, limit = 30) {
    const meta = this.meta(key);
    const rows = await this.list(key, { page: 1, pageSize: limit, search, deleted: 'live' });
    return rows.items.map((r: any) => ({ id: r._id, label: r._label }));
  }

  async counts() {
    const out: Record<string, { live: number; deleted: number }> = {};
    for (const meta of ENTITIES) {
      const d = this.delegate(meta);
      const [live, deleted] = await Promise.all([
        d.count({ where: meta.softDelete ? { deletedAt: null } : {} }),
        meta.softDelete ? d.count({ where: { deletedAt: { not: null } } }) : Promise.resolve(0),
      ]);
      out[meta.key] = { live, deleted };
    }
    return out;
  }
}
