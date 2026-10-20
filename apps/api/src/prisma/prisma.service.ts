import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';
import { tenantGuard } from './tenant-guard';

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error('DATABASE_URL is not set (see .env.example)');
  const adapter = new PrismaMariaDb(databaseUrl, {});
  return new PrismaClient({ adapter }).$extends(tenantGuard);
}

type ExtendedClient = ReturnType<typeof createPrismaClient>;

/** Client passed into transaction callbacks (and accepted where a plain client also works). */
export type Tx = Omit<ExtendedClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | 'onModuleDestroy'>;

/**
 * Nest-injectable Prisma client with the tenant guard applied. The constructor returns the extended client
 * (class/interface merge below gives it the extended type), so `this.prisma.deck.findMany(...)` is guarded.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  constructor() {
    const client = createPrismaClient();
    Object.assign(client, { onModuleDestroy: () => client.$disconnect() });
    return client as unknown as PrismaService;
  }
  onModuleDestroy(): Promise<void> {
    return Promise.resolve();
  }
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PrismaService extends ExtendedClient {}
