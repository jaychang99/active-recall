import 'reflect-metadata';
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';

async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.API_PORT ?? 4000);
  const host = process.env.API_HOST ?? '127.0.0.1';
  await app.listen(port, host);
  Logger.log(`Recall Studio API listening on http://${host}:${port} (docs at /docs)`, 'Bootstrap');
}

void bootstrap();
