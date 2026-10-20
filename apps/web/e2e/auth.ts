/* Test identity + a synchronous HS256 signer (same contract as apps/api/src/auth/token.ts) so the e2e
 * API client can call the API as the user the browser signs in as (dev login, same e-mail). */
import { createHmac } from 'node:crypto';

export const E2E_USER = { provider: 'dev', providerSub: 'e2e@test.local', email: 'e2e@test.local', name: 'e2e' };
export const STORAGE_STATE = 'e2e/.auth/state.json';
const SECRET = process.env.API_JWT_SECRET ?? 'dev-only-api-jwt-secret-change-me-0123456789';

const b64 = (s: string) => Buffer.from(s).toString('base64url');

export function apiToken(user = E2E_USER, ttlSeconds = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ ...user, picture: null, sub: `${user.provider}:${user.providerSub}`, iss: 'recall-web', aud: 'recall-api', iat: now, exp: now + ttlSeconds }));
  const sig = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function authHeaders(user = E2E_USER): Record<string, string> {
  return { Authorization: `Bearer ${apiToken(user)}` };
}
