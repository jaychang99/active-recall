/**
 * AWS Lambda entry point (Function URL / API Gateway proxy events). The Nest app is bootstrapped once per
 * container and reused across invocations; `createApp` is the same factory as `main.ts`.
 */
import 'reflect-metadata';
import serverlessExpress from '@codegenie/serverless-express';
import type { Handler } from 'aws-lambda';
import { createApp } from './app.factory';

let cached: Handler | undefined;

async function bootstrap(): Promise<Handler> {
  const app = await createApp();
  await app.init();
  return serverlessExpress({ app: app.getHttpAdapter().getInstance() });
}

export const handler: Handler = async (event, context, callback) => {
  cached ??= await bootstrap();
  return cached(event, context, callback);
};
