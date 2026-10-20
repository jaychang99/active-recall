/**
 * API bearer tokens. The web app (Auth.js session) mints a short-lived HS256 JWT with the shared
 * `API_JWT_SECRET`; the API verifies it and resolves the user. Keep the claim shape in sync with
 * apps/web/lib/server/api-token.ts.
 */
import { SignJWT, jwtVerify } from 'jose';

export const API_TOKEN_ISSUER = 'recall-web';
export const API_TOKEN_AUDIENCE = 'recall-api';
export const API_TOKEN_TTL_SECONDS = 60 * 60;

export interface ApiTokenClaims {
  /** identity provider: "google" | "dev" */
  provider: string;
  /** stable id at the provider (google `sub`, or the e-mail for the dev provider) */
  providerSub: string;
  email: string;
  name?: string | null;
  picture?: string | null;
}

export function apiTokenSecret(): Uint8Array {
  const secret = process.env.API_JWT_SECRET;
  if (!secret) throw new Error('API_JWT_SECRET is not set (see .env.example)');
  if (process.env.NODE_ENV === 'production' && secret.length < 32) throw new Error('API_JWT_SECRET must be at least 32 characters in production');
  return new TextEncoder().encode(secret);
}

export async function signApiToken(claims: ApiTokenClaims, secret: Uint8Array, ttlSeconds = API_TOKEN_TTL_SECONDS): Promise<string> {
  return new SignJWT({ provider: claims.provider, providerSub: claims.providerSub, email: claims.email, name: claims.name ?? null, picture: claims.picture ?? null })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(`${claims.provider}:${claims.providerSub}`)
    .setIssuer(API_TOKEN_ISSUER)
    .setAudience(API_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secret);
}

export async function verifyApiToken(token: string, secret: Uint8Array): Promise<ApiTokenClaims> {
  const { payload } = await jwtVerify(token, secret, { issuer: API_TOKEN_ISSUER, audience: API_TOKEN_AUDIENCE, algorithms: ['HS256'] });
  const provider = typeof payload.provider === 'string' ? payload.provider : '';
  const providerSub = typeof payload.providerSub === 'string' ? payload.providerSub : '';
  const email = typeof payload.email === 'string' ? payload.email : '';
  if (!provider || !providerSub || !email) throw new Error('Token is missing identity claims');
  return {
    provider,
    providerSub,
    email,
    name: typeof payload.name === 'string' ? payload.name : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
  };
}
