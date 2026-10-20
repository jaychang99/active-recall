/**
 * Server-only: mints the bearer token the browser sends to the API. Mirrors apps/api/src/auth/token.ts —
 * same secret (API_JWT_SECRET), issuer, audience and claims.
 */
import 'server-only';
import { SignJWT } from 'jose';

export const API_TOKEN_ISSUER = 'recall-web';
export const API_TOKEN_AUDIENCE = 'recall-api';
export const API_TOKEN_TTL_SECONDS = 60 * 60;

export interface ApiIdentity {
  provider: string;
  providerSub: string;
  email: string;
  name?: string | null;
  picture?: string | null;
}

function secret(): Uint8Array {
  const s = process.env.API_JWT_SECRET;
  if (!s) throw new Error('API_JWT_SECRET is not set (see .env.example)');
  return new TextEncoder().encode(s);
}

export async function mintApiToken(id: ApiIdentity): Promise<{ token: string; expiresAt: number }> {
  const exp = Math.floor(Date.now() / 1000) + API_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({ provider: id.provider, providerSub: id.providerSub, email: id.email, name: id.name ?? null, picture: id.picture ?? null })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(`${id.provider}:${id.providerSub}`)
    .setIssuer(API_TOKEN_ISSUER)
    .setAudience(API_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret());
  return { token, expiresAt: exp * 1000 };
}
