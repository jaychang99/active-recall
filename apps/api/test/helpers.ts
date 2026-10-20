import 'reflect-metadata';
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import type { QuestionBatch } from '@recall/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { signApiToken } from '../src/auth/token';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.API_JWT_SECRET ??= 'test-secret-recall-studio-0123456789abcdef';
const SECRET = new TextEncoder().encode(process.env.API_JWT_SECRET);

/** Test identities: "a", "b", … become dev users a@test.local, b@test.local. */
export function identity(name: string) {
  return { provider: 'dev', providerSub: `${name}@test.local`, email: `${name}@test.local`, name: `User ${name}` };
}
export function tokenFor(name: string) {
  return signApiToken(identity(name), SECRET);
}

export async function createApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false }), { swagger: false });
  await app.init();
  const prisma = app.get(PrismaService);
  const server = app.getHttpServer() as Parameters<typeof request>[0];
  const tokens: Record<string, string> = {};
  for (const n of ['a', 'b', 'c']) tokens[n] = await tokenFor(n);
  /** supertest agent that sends user `name`'s bearer token on every request */
  const as = (name: 'a' | 'b' | 'c') => request.agent(server).set('Authorization', `Bearer ${tokens[name]}`);
  /** internal user id (exists once the user made at least one authenticated request) */
  const userId = async (name: 'a' | 'b' | 'c') => {
    const id = identity(name);
    const u = await prisma.user.findUniqueOrThrow({ where: { provider_providerSub: { provider: id.provider, providerSub: id.providerSub } } });
    return u.id;
  };
  return { app, prisma, server, as, api: as('a'), userId, tokens };
}

export async function resetDb(prisma: PrismaService) {
  // children first; pooled connections make SET FOREIGN_KEY_CHECKS unreliable
  for (const t of ['ExamResponse', 'ExamAttempt', 'PracticeLog', 'QuestionNote', 'ReviewLog', 'StudySession', 'CardState', 'QuestionSubject', 'Subject', 'Question', 'Deck', 'AppSettings', 'User']) {
    await prisma.$executeRawUnsafe(`DELETE FROM \`${t}\``);
  }
}

export function exampleBatch(): QuestionBatch {
  const file = join(__dirname, '..', '..', '..', 'examples', 'example-question-batch.json');
  return JSON.parse(readFileSync(file, 'utf8')) as QuestionBatch;
}
