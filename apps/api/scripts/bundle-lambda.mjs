/**
 * Bundles dist/lambda.js into <out>/index.js (CommonJS) for AWS Lambda.
 *
 * Why: Lambda's Node runtimes start with `--no-experimental-require-module`, so the tsc CommonJS output
 * cannot `require()` ESM-only packages (NestJS 12, jose, …). esbuild inlines exactly those ESM modules and
 * leaves every CommonJS package as an external `require()` served from the shipped node_modules.
 *
 *   node scripts/bundle-lambda.mjs <lambda-dist dir>
 */
import { build } from 'esbuild';
import { createRequire, isBuiltin } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'lambda-dist');
const entry = join(out, 'dist', 'lambda.js');
if (!existsSync(entry)) throw new Error(`missing ${entry} (run nest build + pnpm deploy first)`);

const pkgTypeCache = new Map();
function nearestPackageType(file) {
  let dir = dirname(file);
  for (;;) {
    const pj = join(dir, 'package.json');
    if (pkgTypeCache.has(pj)) return pkgTypeCache.get(pj);
    if (existsSync(pj)) {
      let type = 'commonjs';
      try { type = JSON.parse(readFileSync(pj, 'utf8')).type ?? 'commonjs'; } catch { /* ignore */ }
      pkgTypeCache.set(pj, type);
      return type;
    }
    const parent = dirname(dir);
    if (parent === dir) return 'commonjs';
    dir = parent;
  }
}
const isEsmFile = (file) => extname(file) === '.mjs' || (extname(file) === '.js' && nearestPackageType(file) === 'module');

const inlined = new Set();
const externals = new Set();
const unresolved = new Set();

/**
 * Bare specifiers: inline when they resolve to an ES module; otherwise emit an external require() of the
 * resolved file by a path relative to the bundle. (pnpm only hoists direct dependencies to node_modules/,
 * so a transitive CJS dependency of an inlined ESM package — e.g. `uid` for @nestjs/common — would not be
 * resolvable from the bundle's own location by its bare name.)
 */
const esmOnlyPlugin = {
  name: 'inline-esm-only',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (isBuiltin(args.path) || args.path.startsWith('node:')) return { path: args.path, external: true };
      const req = createRequire(args.importer && args.importer.startsWith('/') ? args.importer : join(out, 'index.js'));
      let file;
      try {
        file = req.resolve(args.path);
      } catch {
        unresolved.add(args.path); // optional peer (e.g. @nestjs/microservices) — stays a lazy require
        return { path: args.path, external: true };
      }
      if (isEsmFile(file)) {
        inlined.add(args.path);
        return { path: file };
      }
      externals.add(args.path);
      const rel = relative(out, file);
      return { path: rel.startsWith('.') ? rel : `./${rel}`, external: true };
    });
  },
};

await build({
  entryPoints: [entry],
  outfile: join(out, 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  keepNames: true,
  sourcemap: false,
  logLevel: 'warning',
  legalComments: 'none',
  // ESM code inlined into this CJS file keeps working: import.meta.url points at the bundle itself.
  define: { 'import.meta.url': '__lambdaBundleUrl' },
  banner: { js: "const __lambdaBundleUrl = require('node:url').pathToFileURL(__filename).href;" },
  plugins: [esmOnlyPlugin],
});

const list = (s) => [...s].sort().join(', ');
console.log(`   inlined ESM: ${list(inlined)}`);
console.log(`   external CJS: ${externals.size} packages`);
if (unresolved.size) console.log(`   optional (not installed, left as lazy require): ${list(unresolved)}`);
