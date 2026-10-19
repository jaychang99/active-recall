import 'reflect-metadata';
import 'dotenv/config';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '6mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });
  // Local-first: accept any localhost / 127.0.0.1 origin (dev :3000, production build :3001, installed PWA)
  // plus an explicit WEB_ORIGIN. Never expose this API publicly — it has no auth.
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || origin === webOrigin || localOrigin.test(origin)),
    credentials: false,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new ApiExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Recall Studio API')
    .setDescription('Local-first active recall study API. Not for public exposure: no authentication.')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.API_PORT ?? 4000);
  const host = process.env.API_HOST ?? '127.0.0.1';
  await app.listen(port, host);
  Logger.log(`Recall Studio API listening on http://${host}:${port} (docs at /docs)`, 'Bootstrap');
}

void bootstrap();
