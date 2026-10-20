/**
 * Client-side cache of the API bearer token (minted by `GET /api/token` from the Auth.js session).
 * One in-flight fetch at a time; refreshed a minute before it expires; cleared on sign-out or a 401.
 */
let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string | null> | null = null;

const REFRESH_MARGIN_MS = 60_000;

export function clearApiToken() {
  cached = null;
}

export async function getApiToken(force = false): Promise<string | null> {
  if (!force && cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) return cached.token;
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch('/api/token', { cache: 'no-store', credentials: 'same-origin' });
        if (!res.ok) {
          cached = null;
          return null;
        }
        const body = (await res.json()) as { token: string; expiresAt: number };
        cached = body;
        return body.token;
      } catch {
        return cached?.token ?? null;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

/** Sends the browser to the login page, remembering where it was. No-op on the login page itself. */
export function redirectToLogin() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/login')) return;
  const next = window.location.pathname + window.location.search;
  // Full navigation on purpose: drops in-memory state (query cache, study snapshots) of the signed-out user.
  window.location.assign(new URL(`/login${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`, window.location.origin).href);
}
