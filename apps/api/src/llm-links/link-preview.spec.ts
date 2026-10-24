import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { LinkPreviewCache, fetchLinkPreview, isPublicAddress, parsePreviewHtml, parsePublicUrl, type LinkPreview } from './link-preview';

describe('isPublicAddress / parsePublicUrl', () => {
  it('rejects loopback, private, link-local, CGNAT, metadata and mapped private addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) expect(isPublicAddress(ip), ip).toBe(false);
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) expect(isPublicAddress(ip), ip).toBe(true);
    expect(isPublicAddress('example.com')).toBe(false);
  });

  it('accepts public http(s) links on default ports only', () => {
    expect(parsePublicUrl('https://chatgpt.com/share/abc')?.toString()).toBe('https://chatgpt.com/share/abc');
    expect(parsePublicUrl('  http://claude.ai/share/x  ')?.hostname).toBe('claude.ai');
    for (const bad of ['ftp://example.com', 'javascript:alert(1)', 'http://localhost/x', 'http://127.0.0.1/', 'http://[::1]/', 'http://10.0.0.5/a', 'https://user:pw@example.com/', 'https://example.com:8080/', 'http://printer.local/', 'not a url', `https://e.com/${'a'.repeat(2100)}`]) expect(parsePublicUrl(bad), bad).toBeNull();
  });
});

describe('parsePreviewHtml', () => {
  it('reads Open Graph first, then twitter/<title>, resolves relative URLs and decodes entities', () => {
    const html = `<!doctype html><html><head>
      <title>Fallback &amp; title</title>
      <meta content="ChatGPT" property="og:site_name">
      <meta property='og:title' content='TCP vs UDP &#8212; &quot;share&quot;'>
      <meta name="description" content="plain description">
      <meta property="og:image" content="/img/og.png">
      <link rel="shortcut icon" href="/favicon-32.png">
      </head><body><meta property="og:title" content="ignored body tag"></body></html>`;
    const p = parsePreviewHtml(html, 'https://chatgpt.com/share/abc');
    expect(p).toEqual({ title: 'TCP vs UDP — "share"', description: 'plain description', siteName: 'ChatGPT', image: 'https://chatgpt.com/img/og.png', icon: 'https://chatgpt.com/favicon-32.png' });
  });

  it('falls back to <title> and /favicon.ico, and ignores non-http image URLs', () => {
    const p = parsePreviewHtml('<head><title>\n  Only   title </title><meta property="og:image" content="javascript:x"></head>', 'https://example.com/a/b');
    expect(p.title).toBe('Only title');
    expect(p.image).toBeNull();
    expect(p.icon).toBe('https://example.com/favicon.ico');
    expect(parsePreviewHtml('<html></html>', 'https://example.com').title).toBeNull();
    expect(parsePreviewHtml('<head><meta property="og:title" content="\u200eGoogle Gemini"></head>', 'https://gemini.google.com').title).toBe('Google Gemini');
  });
});

describe('fetchLinkPreview', () => {
  it('never connects to local addresses, including through a redirect target', async () => {
    const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<head><title>secret</title></head>'); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const direct = await fetchLinkPreview(`http://127.0.0.1:${port}/`);
      expect(direct).toMatchObject({ status: 'failed', error: 'blocked', title: null });
      expect((await fetchLinkPreview('http://localhost/')).error).toBe('blocked');
    } finally {
      server.close();
    }
  });
});

describe('LinkPreviewCache', () => {
  it('serves repeats from memory and evicts the oldest entry past the limit', async () => {
    const make = (url: string): LinkPreview => ({ url, finalUrl: url, status: 'ok', title: url, description: null, siteName: null, image: null, icon: null });
    const fetcher = vi.fn(async (url: string) => make(url));
    const cache = new LinkPreviewCache(2, fetcher);
    await cache.get('https://a.com/');
    await cache.get('https://a.com/');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await cache.get('https://b.com/');
    await cache.get('https://c.com/');
    await cache.get('https://a.com/');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
