/**
 * Link previews for saved LLM answer links: fetch the page and read its Open Graph / <title> / icon tags.
 * Nothing is stored; results are cached in memory for a while.
 *
 * The API fetches user-supplied URLs, so every hop is guarded against SSRF: http(s) on the default ports only,
 * no credentials, and every resolved address must be public. The check runs inside the socket's DNS lookup,
 * so a rebinding answer between "check" and "connect" cannot slip through. Redirects are followed by hand
 * (each one re-checked), and time and size are capped.
 */
import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import { BlockList, isIP } from 'node:net';
import * as zlib from 'node:zlib';
import type { Readable } from 'node:stream';

export interface LinkPreview {
  url: string;
  /** Where the redirects ended. */
  finalUrl: string;
  /** ok: title found · partial: page fetched but no title · failed: could not fetch (see `error`). */
  status: 'ok' | 'partial' | 'failed';
  title: string | null;
  description: string | null;
  siteName: string | null;
  image: string | null;
  icon: string | null;
  error?: 'blocked' | 'timeout' | 'too_many_redirects' | 'not_html' | 'network' | `http_${number}`;
}

export const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 4;
const MAX_BYTES = 768 * 1024;
const TIMEOUT_MS = 6000;
const USER_AGENT = 'Mozilla/5.0 (compatible; RecallStudioLinkPreview/1.0)';

const blocked = new BlockList();
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) blocked.addSubnet(net, prefix, 'ipv6');

/** True for addresses on the public internet (not loopback, private, link-local, CGNAT, multicast, docs…). */
export function isPublicAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) return !blocked.check(address, 'ipv4');
  if (v === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return isPublicAddress(mapped[1]!);
    return !blocked.check(address, 'ipv6');
  }
  return false;
}

/** Parse and vet a URL the user pasted. Returns null when it is not something we will fetch. */
export function parsePublicUrl(raw: string): URL | null {
  if (typeof raw !== 'string' || raw.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  if (isIP(host) && !isPublicAddress(host)) return null;
  return url;
}

class BlockedError extends Error { constructor() { super('blocked address'); } }

// Node passes { all: true } when it wants every address (happy eyeballs); answer in the shape it asked for.
function safeLookup(hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) return callback(new BlockedError());
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) out[m[1]!.toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

const clean = (s: string | undefined | null, max: number) => {
  // Pages often wrap titles in invisible direction marks (Gemini's starts with U+200E).
  const t = (s ?? '').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  return t ? (t.length > max ? `${t.slice(0, max - 1)}…` : t) : null;
};

function absolute(href: string | undefined, base: URL): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}

/** Read the preview fields from a page's <head>. */
export function parsePreviewHtml(html: string, pageUrl: string): Omit<LinkPreview, 'url' | 'finalUrl' | 'status' | 'error'> {
  const base = new URL(pageUrl);
  const end = html.search(/<\/head\s*>/i);
  const head = end >= 0 ? html.slice(0, end) : html;
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop ?? '').toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
  }
  let icon: string | null = null;
  let touchIcon: string | null = null;
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = (a.rel ?? '').toLowerCase().split(/\s+/);
    if (!icon && rel.includes('icon')) icon = absolute(a.href, base);
    if (!touchIcon && rel.some((r) => r.startsWith('apple-touch-icon'))) touchIcon = absolute(a.href, base);
  }
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(head)?.[1];
  return {
    title: clean(meta['og:title'] ?? meta['twitter:title'] ?? (title ? decodeEntities(title) : null), 300),
    description: clean(meta['og:description'] ?? meta['twitter:description'] ?? meta.description, 500),
    siteName: clean(meta['og:site_name'] ?? meta['application-name'], 120),
    image: absolute(meta['og:image:secure_url'] ?? meta['og:image'] ?? meta['twitter:image'] ?? meta['twitter:image:src'], base),
    icon: icon ?? touchIcon ?? new URL('/favicon.ico', base).toString(),
  };
}

function decoded(res: http.IncomingMessage): Readable {
  const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
  if (enc === 'gzip' || enc === 'x-gzip') return res.pipe(zlib.createGunzip());
  if (enc === 'deflate') return res.pipe(zlib.createInflate());
  if (enc === 'br') return res.pipe(zlib.createBrotliDecompress());
  return res;
}

type Hop = { kind: 'redirect'; to: string } | { kind: 'page'; html: string } | { kind: 'error'; error: NonNullable<LinkPreview['error']> };

function fetchOnce(url: URL, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'GET',
      signal,
      lookup: safeLookup as never,
      // Google pages send more headers than Node's 16 KB default.
      maxHeaderSize: 64 * 1024,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1', 'accept-language': 'ko,en;q=0.8', 'accept-encoding': 'gzip, deflate, br' },
    });
    req.on('error', (e) => resolve({ kind: 'error', error: e instanceof BlockedError || (e as { cause?: unknown }).cause instanceof BlockedError ? 'blocked' : e.name === 'AbortError' ? 'timeout' : 'network' }));
    req.on('response', (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) { res.resume(); return resolve({ kind: 'redirect', to: res.headers.location }); }
      if (status < 200 || status >= 300) { res.resume(); return resolve({ kind: 'error', error: `http_${status}` }); }
      const type = String(res.headers['content-type'] ?? '').toLowerCase();
      if (type && !type.includes('html')) { res.resume(); return resolve({ kind: 'error', error: 'not_html' }); }
      const body = decoded(res);
      const chunks: Buffer[] = [];
      let size = 0;
      const finish = () => resolve({ kind: 'page', html: Buffer.concat(chunks).toString('utf8') });
      body.on('data', (c: Buffer) => {
        chunks.push(c);
        size += c.length;
        // The head is all we read; stop once it is in or the cap is hit.
        if (size >= MAX_BYTES || /<\/head\s*>/i.test(c.toString('latin1'))) { finish(); req.destroy(); }
      });
      body.on('end', finish);
      body.on('error', () => (chunks.length ? finish() : resolve({ kind: 'error', error: 'network' })));
    });
    req.end();
  });
}

export async function fetchLinkPreview(raw: string): Promise<LinkPreview> {
  const start = parsePublicUrl(raw);
  const empty = { title: null, description: null, siteName: null, image: null, icon: null };
  if (!start) return { url: raw, finalUrl: raw, status: 'failed', error: 'blocked', ...empty };
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const r = await fetchOnce(url, signal);
    if (r.kind === 'error') return { url: start.toString(), finalUrl: url.toString(), status: 'failed', error: r.error, ...empty };
    if (r.kind === 'page') {
      const fields = parsePreviewHtml(r.html, url.toString());
      return { url: start.toString(), finalUrl: url.toString(), status: fields.title ? 'ok' : 'partial', ...fields };
    }
    const next = (() => { try { return parsePublicUrl(new URL(r.to, url).toString()); } catch { return null; } })();
    if (!next) return { url: start.toString(), finalUrl: url.toString(), status: 'failed', error: 'blocked', ...empty };
    url = next;
  }
  return { url: start.toString(), finalUrl: url.toString(), status: 'failed', error: 'too_many_redirects', ...empty };
}

/** Small in-memory cache (per instance): successes for 6 h, failures for 10 min. */
export class LinkPreviewCache {
  private entries = new Map<string, { at: number; value: LinkPreview }>();
  constructor(private readonly max = 500, private readonly fetcher = fetchLinkPreview) {}
  async get(url: string): Promise<LinkPreview> {
    const hit = this.entries.get(url);
    const ttl = hit?.value.status === 'failed' ? 10 * 60_000 : 6 * 60 * 60_000;
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = await this.fetcher(url);
    this.entries.delete(url);
    this.entries.set(url, { at: Date.now(), value });
    if (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!);
    return value;
  }
}
