/**
 * AWS Lambda entry point (Function URL / API Gateway proxy events). The Nest app is bootstrapped once per
 * container and reused across invocations; `createApp` is the same factory as `main.ts`.
 * Promise-style handler only: Node.js 24 on Lambda rejects callback-based (3-argument) handlers.
 */
import 'reflect-metadata';
import serverlessExpress from '@codegenie/serverless-express';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { createApp } from './app.factory';

type Proxy = (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResultV2>;
let cached: Proxy | undefined;

async function bootstrap(): Promise<Proxy> {
  const app = await createApp();
  await app.init();
  return serverlessExpress({ app: app.getHttpAdapter().getInstance() }) as unknown as Proxy;
}

export const handler = async (event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyResultV2> => {
  cached ??= await bootstrap();
  return cached(event, context);
};
