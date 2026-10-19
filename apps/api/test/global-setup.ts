/* Integration tests run against a dedicated MySQL database (TEST_DATABASE_URL) migrated with prisma migrate deploy. */
import 'dotenv/config';
import { execSync } from 'node:child_process';

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see apps/api/.env.example)');
  process.env.DATABASE_URL = url;
  execSync('pnpm prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
