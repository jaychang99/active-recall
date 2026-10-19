import 'reflect-metadata';
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QuestionBatch } from '@recall/contracts';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

export async function createApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  app.useBodyParser('json', { limit: '6mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, server: app.getHttpServer() as Parameters<typeof import('supertest')>[0] };
}

export async function resetDb(prisma: PrismaService) {
  // children first; pooled connections make SET FOREIGN_KEY_CHECKS unreliable
  for (const t of ['ExamResponse', 'ExamAttempt', 'PracticeLog', 'QuestionNote', 'ReviewLog', 'StudySession', 'CardState', 'QuestionSubject', 'Subject', 'Question', 'Deck', 'AppSettings']) {
    await prisma.$executeRawUnsafe(`DELETE FROM \`${t}\``);
  }
}

export function exampleBatch(): QuestionBatch {
  const file = join(__dirname, '..', '..', '..', 'examples', 'example-question-batch.json');
  return JSON.parse(readFileSync(file, 'utf8')) as QuestionBatch;
}
