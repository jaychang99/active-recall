/**
 * Tenant safety net. Every model except `User` carries `userId`; services must scope every query with it.
 * This Prisma client extension inspects top-level operations and throws when a tenant model is read or
 * written without a `userId`, so a forgotten filter fails loudly (in tests) instead of leaking another user's rows.
 * Raw SQL is not inspected — scope it by hand.
 */
import { Prisma } from '../generated/prisma/client';

export class TenantScopeError extends Error {
  constructor(model: string, operation: string, what: string) {
    super(`Tenant scope missing: ${model}.${operation} without ${what}`);
    this.name = 'TenantScopeError';
  }
}

const TENANT_FREE_MODELS = new Set(['User']);
/** `Share` has two parties: the sender owns the row (`userId`), the recipient reaches it by `recipientEmail`. */
const RECIPIENT_SCOPED_MODELS = new Set(['Share']);
const WHERE_OPERATIONS = new Set(['findFirst', 'findFirstOrThrow', 'findMany', 'findUnique', 'findUniqueOrThrow', 'update', 'updateMany', 'updateManyAndReturn', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy', 'upsert']);
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** True when a `where` pins `userId` directly, inside a compound unique (`userId_slug: { userId }`) or in every branch of an AND. */
export function whereHasUserId(where: unknown): boolean {
  if (!isRecord(where)) return false;
  if (typeof where.userId === 'string' && where.userId.length > 0) return true;
  if (isRecord(where.userId) && typeof where.userId.equals === 'string') return true;
  for (const [k, v] of Object.entries(where)) {
    if (k.startsWith('userId_') && isRecord(v) && typeof v.userId === 'string') return true;
  }
  const and = where.AND;
  if (Array.isArray(and)) return and.some((w) => whereHasUserId(w));
  if (isRecord(and)) return whereHasUserId(and);
  return false;
}

function dataHasUserId(data: unknown): boolean {
  if (!isRecord(data)) return false;
  if (typeof data.userId === 'string' && data.userId.length > 0) return true;
  const user = data.user;
  return isRecord(user) && (isRecord(user.connect) || isRecord(user.connectOrCreate) || isRecord(user.create));
}

/** True when a `where` pins `recipientEmail` to one address (directly or in an AND branch). */
export function whereHasRecipient(where: unknown): boolean {
  if (!isRecord(where)) return false;
  if (typeof where.recipientEmail === 'string' && where.recipientEmail.length > 0) return true;
  const and = where.AND;
  if (Array.isArray(and)) return and.some((w) => whereHasRecipient(w));
  if (isRecord(and)) return whereHasRecipient(and);
  return false;
}

/** Throws unless the operation on `model` is scoped to a tenant. Exported for unit tests. */
export function assertTenantScoped(model: string, operation: string, args: unknown): void {
  if (TENANT_FREE_MODELS.has(model)) return;
  const a = isRecord(args) ? args : {};
  const scoped = (w: unknown) => whereHasUserId(w) || (RECIPIENT_SCOPED_MODELS.has(model) && whereHasRecipient(w));
  if (WHERE_OPERATIONS.has(operation) && !scoped(a.where)) throw new TenantScopeError(model, operation, 'where.userId');
  if (operation === 'upsert' && !dataHasUserId(a.create)) throw new TenantScopeError(model, operation, 'create.userId');
  if (CREATE_OPERATIONS.has(operation)) {
    const rows = Array.isArray(a.data) ? a.data : [a.data];
    if (rows.length > 0 && !rows.every(dataHasUserId)) throw new TenantScopeError(model, operation, 'data.userId');
  }
}

export const tenantGuard = Prisma.defineExtension({
  name: 'tenantGuard',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        assertTenantScoped(model, operation, args);
        return query(args);
      },
    },
  },
});
