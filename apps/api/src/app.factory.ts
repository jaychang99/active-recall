import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';

export interface AppOptions {
  /** mount Swagger UI at /docs (default: true) */
  swagger?: boolean;
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** Allowed browser origins: `WEB_ORIGIN` (comma-separated) plus any localhost origin outside production. */
export function allowedOrigins(): { list: string[]; allowLocalhost: boolean } {
  const list = (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return { list, allowLocalhost: process.env.NODE_ENV !== 'production' };
}

/** Applies the body parsers, validation, error filter, CORS and Swagger shared by the server, the Lambda handler and the tests. */
export function configureApp(app: NestExpressApplication, opts: AppOptions = {}): NestExpressApplication {
  app.useBodyParser('json', { limit: '6mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });
  const { list, allowLocalhost } = allowedOrigins();
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || list.includes(origin) || (allowLocalhost && LOCAL_ORIGIN.test(origin))),
    credentials: false,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new ApiExceptionFilter());
  if (opts.swagger !== false) {
    const config = new DocumentBuilder()
      .setTitle('Recall Studio API')
      .setDescription('Active-recall study API. Every route except /health and /schemas needs `Authorization: Bearer <api token>` (minted by the web app from the signed-in session).')
      .setVersion('0.2.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }
  return app;
}

export async function createApp(opts: AppOptions = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  return configureApp(app, opts);
}
