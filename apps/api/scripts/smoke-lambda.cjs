/* Loads the built Lambda bundle and invokes the handler for a few routes (no real DB needed):
 * proves module resolution after pruning, routing, the auth guard and bundled static files. */
const path = require('node:path');
const dir = process.argv[2] || path.join(__dirname, '..', 'lambda-dist');
process.env.DATABASE_URL ??= 'mysql://smoke:smoke@127.0.0.1:1/smoke';
process.env.API_JWT_SECRET ??= 'smoke-test-secret-0123456789abcdefghijklmn';
process.env.NODE_ENV ??= 'production';
process.env.WEB_ORIGIN ??= 'https://example.invalid';
const { handler } = require(path.join(dir, 'index.js'));
const event = (p) => ({ version: '2.0', routeKey: '$default', rawPath: p, rawQueryString: '', headers: { host: 'smoke.lambda-url.ap-northeast-1.on.aws' }, requestContext: { http: { method: 'GET', path: p, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'smoke' }, requestId: 'r1', stage: '$default', domainName: 'smoke' }, isBase64Encoded: false });
(async () => {
  const checks = [
    ['/health', (r) => r.statusCode === 200 && String(r.body).includes('"status"')],
    ['/decks', (r) => r.statusCode === 401],
    ['/schemas/question-batch.schema.json', (r) => r.statusCode === 200 && String(r.body).includes('$schema')],
    ['/schemas/question-generator-prompt.md', (r) => r.statusCode === 200 && String(r.body).includes('Recall Studio')],
    ['/schemas/example-question-batch.json', (r) => r.statusCode === 200 && String(r.body).includes('"questions"')],
  ];
  let failed = 0;
  for (const [p, ok] of checks) {
    const r = await handler(event(p), {}, () => {});
    const pass = ok(r);
    if (!pass) failed++;
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${p} → ${r.statusCode} ${String(r.body).slice(0, 60).replace(/\n/g, ' ')}`);
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
