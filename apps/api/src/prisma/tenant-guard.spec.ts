import { describe, expect, it } from 'vitest';
import { assertTenantScoped, TenantScopeError, whereHasRecipient, whereHasUserId } from './tenant-guard';

describe('tenant guard', () => {
  it('accepts userId directly, inside compound uniques and inside AND lists', () => {
    expect(whereHasUserId({ userId: 'u1' })).toBe(true);
    expect(whereHasUserId({ userId_slug: { userId: 'u1', slug: 'x' } })).toBe(true);
    expect(whereHasUserId({ userId_idempotencyKey: { userId: 'u1', idempotencyKey: 'k' } })).toBe(true);
    expect(whereHasUserId({ AND: [{ deletedAt: null }, { userId: 'u1' }] })).toBe(true);
    expect(whereHasUserId({ id: 'x' })).toBe(false);
    expect(whereHasUserId({ userId: '' })).toBe(false);
    expect(whereHasUserId({ OR: [{ userId: 'u1' }] })).toBe(false);
    expect(whereHasUserId(undefined)).toBe(false);
  });

  it('throws for unscoped reads, writes and deletes on tenant models', () => {
    expect(() => assertTenantScoped('Deck', 'findMany', {})).toThrow(TenantScopeError);
    expect(() => assertTenantScoped('Deck', 'findUnique', { where: { id: 'd1' } })).toThrow(/where.userId/);
    expect(() => assertTenantScoped('Question', 'updateMany', { where: { deckId: 'd1' }, data: {} })).toThrow(TenantScopeError);
    expect(() => assertTenantScoped('Question', 'deleteMany', { where: {} })).toThrow(TenantScopeError);
    expect(() => assertTenantScoped('ReviewLog', 'count', { where: { undone: false } })).toThrow(TenantScopeError);
    expect(() => assertTenantScoped('Subject', 'create', { data: { name: 'x' } })).toThrow(/data.userId/);
    expect(() => assertTenantScoped('Question', 'createMany', { data: [{ userId: 'u1' }, { externalId: 'q' }] })).toThrow(/data.userId/);
    expect(() => assertTenantScoped('CardState', 'upsert', { where: { questionId: 'q', userId: 'u1' }, create: { questionId: 'q' }, update: {} })).toThrow(/create.userId/);
  });

  it('passes scoped operations and never guards User', () => {
    expect(() => assertTenantScoped('Deck', 'findMany', { where: { userId: 'u1' } })).not.toThrow();
    expect(() => assertTenantScoped('Deck', 'delete', { where: { id: 'd1', userId: 'u1' } })).not.toThrow();
    expect(() => assertTenantScoped('Subject', 'create', { data: { userId: 'u1', name: 'x' } })).not.toThrow();
    expect(() => assertTenantScoped('Subject', 'create', { data: { name: 'x', user: { connect: { id: 'u1' } } } })).not.toThrow();
    expect(() => assertTenantScoped('Question', 'createMany', { data: [] })).not.toThrow();
    expect(() => assertTenantScoped('CardState', 'upsert', { where: { questionId: 'q', userId: 'u1' }, create: { questionId: 'q', userId: 'u1' }, update: {} })).not.toThrow();
    expect(() => assertTenantScoped('User', 'findMany', {})).not.toThrow();
    expect(() => assertTenantScoped('User', 'create', { data: { email: 'x' } })).not.toThrow();
  });

  it('lets Share be scoped by sender (userId) or by recipient (recipientEmail), and nothing else', () => {
    expect(whereHasRecipient({ recipientEmail: 'b@x' })).toBe(true);
    expect(whereHasRecipient({ AND: [{ id: 's1' }, { recipientEmail: 'b@x' }] })).toBe(true);
    expect(whereHasRecipient({ recipientEmail: '' })).toBe(false);
    expect(whereHasRecipient({ recipientEmail: { contains: '@' } })).toBe(false);
    expect(() => assertTenantScoped('Share', 'findMany', { where: { userId: 'u1' } })).not.toThrow();
    expect(() => assertTenantScoped('Share', 'updateMany', { where: { id: 's1', recipientEmail: 'b@x', status: 'pending' }, data: {} })).not.toThrow();
    expect(() => assertTenantScoped('Share', 'findFirst', { where: { id: 's1' } })).toThrow(TenantScopeError);
    expect(() => assertTenantScoped('Share', 'findMany', { where: { recipientId: 'u2' } })).toThrow(TenantScopeError);
    // recipientEmail scoping is Share-only
    expect(() => assertTenantScoped('Deck', 'findMany', { where: { recipientEmail: 'b@x' } })).toThrow(TenantScopeError);
  });
});
