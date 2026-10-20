import { describe, expect, it } from 'vitest';
import { signApiToken, verifyApiToken, type ApiTokenClaims } from './token';
import { jwtVerify, SignJWT } from 'jose';

const secret = new TextEncoder().encode('unit-test-secret-0123456789abcdefghij');
const claims: ApiTokenClaims = { provider: 'google', providerSub: '1234567890', email: 'me@example.com', name: 'Me', picture: 'https://img' };

describe('api tokens', () => {
  it('round-trips identity claims and pins sub/iss/aud', async () => {
    const token = await signApiToken(claims, secret);
    expect(await verifyApiToken(token, secret)).toEqual(claims);
    const { payload } = await jwtVerify(token, secret);
    expect(payload.sub).toBe('google:1234567890');
    expect(payload.iss).toBe('recall-web');
    expect(payload.aud).toBe('recall-api');
  });

  it('rejects a wrong secret, an expired token and a token for another audience', async () => {
    const token = await signApiToken(claims, secret);
    await expect(verifyApiToken(token, new TextEncoder().encode('other-secret-0123456789abcdefghijklmn'))).rejects.toThrow();
    const expired = await signApiToken(claims, secret, -10);
    await expect(verifyApiToken(expired, secret)).rejects.toThrow();
    const foreign = await new SignJWT({ provider: 'google', providerSub: 'x', email: 'x@y' }).setProtectedHeader({ alg: 'HS256' }).setIssuer('recall-web').setAudience('someone-else').setExpirationTime('1h').sign(secret);
    await expect(verifyApiToken(foreign, secret)).rejects.toThrow();
  });

  it('rejects tokens without identity claims', async () => {
    const anonymous = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuer('recall-web').setAudience('recall-api').setExpirationTime('1h').sign(secret);
    await expect(verifyApiToken(anonymous, secret)).rejects.toThrow(/identity/);
  });
});
