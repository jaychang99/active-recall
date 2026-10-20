#!/usr/bin/env bash
# Builds a self-contained Lambda bundle for the API:
#   apps/api/lambda-dist/            → index.js (esbuild bundle of dist/ with ESM-only deps inlined) + production node_modules
#   apps/api/lambda-dist/lambda.zip  → what infra/aws/deploy-api.sh uploads
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(cd ../.. && pwd)"
OUT="$PWD/lambda-dist"

echo "▸ prisma generate + nest build"
pnpm exec prisma generate >/dev/null
pnpm exec nest build

echo "▸ pnpm deploy (production deps, workspace packages inlined)"
rm -rf "$OUT"
# pnpm ≥9 wants --legacy for the plain node_modules layout; pnpm 8 has no such flag.
pnpm --filter @recall/api --prod deploy --legacy "$OUT" >/dev/null 2>&1 || pnpm --filter @recall/api --prod deploy "$OUT" >/dev/null

echo "▸ assemble"
rm -rf "$OUT/src" "$OUT/test" "$OUT/prisma/migrations" "$OUT/dist" 2>/dev/null || true
cp -R dist "$OUT/dist"
# /schemas/* serves these repo files; the controller resolves them relative to dist/ → <root>/examples, <root>/docs
mkdir -p "$OUT/examples" "$OUT/docs"
cp "$ROOT/examples/example-question-batch.json" "$OUT/examples/"
cp "$ROOT/docs/QUESTION_GENERATOR_PROMPT.md" "$OUT/docs/"
echo "▸ bundle (inline ESM-only packages — Lambda's node runs with --no-experimental-require-module)"
node "$PWD/scripts/bundle-lambda.mjs" "$OUT"
rm -rf "$OUT/dist"
# Packages the inlined ESM code loads at runtime through createRequire(import.meta.url) (bare names, resolved
# from the bundle root) must be reachable from node_modules/ — pnpm only hoists direct dependencies.
for hoist in swagger-ui-dist; do
  real=$(ls -d "$OUT"/node_modules/.pnpm/${hoist}@*/node_modules/${hoist} 2>/dev/null | head -1)
  [ -n "$real" ] && [ ! -e "$OUT/node_modules/$hoist" ] && ln -s "${real#"$OUT"/node_modules/}" "$OUT/node_modules/$hoist"
done
echo "▸ prune"
# The `prisma` CLI is only an optional peer of @prisma/client, but pnpm deploy still ships it together with its
# dev-time tree (Prisma Studio, pglite, React, effect, Rust engines …) — none of it runs on Lambda.
PRUNE='prisma@* @prisma+dev@* @prisma+studio-core@* @prisma+engines@* @prisma+engines-version@* @prisma+query-plan-executor@* @prisma+config@* @prisma+get-platform@* @prisma+fetch-engine@* @electric-sql+* react@* react-dom@* scheduler@* effect@* elkjs@* @mrleebo+* typescript@* @types+*'
for pat in $PRUNE; do rm -rf "$OUT"/node_modules/.pnpm/$pat 2>/dev/null || true; done
rm -rf "$OUT/node_modules/prisma" "$OUT/node_modules/.bin" "$OUT/node_modules/.modules.yaml" 2>/dev/null || true
# @prisma/client runtime ships every database's query compiler (as base64 JS) in CJS and ESM; keep MySQL/CJS only.
for rt in "$OUT"/node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client/runtime; do
  find "$rt" -type f \( -name 'query_compiler_*' ! -name '*mysql*' -o -name '*.mjs' -o -name '*.d.ts' -o -name '*.d.mts' -o -name 'index-browser*' -o -name 'react-native*' -o -name 'edge*' -o -name 'wasm-compiler-edge*' \) -delete
done
# generic dead weight
find "$OUT/node_modules" -type d \( -name '.cache' -o -name 'test' -o -name 'tests' -o -name '__tests__' -o -name 'docs' -o -name 'example' -o -name 'examples' \) -prune -exec rm -rf {} + 2>/dev/null || true
find "$OUT/node_modules" -type f \( -name '*.md' -o -name '*.map' -o -name '*.d.ts' -o -name '*.d.mts' -o -name 'LICENSE*' -o -name 'CHANGELOG*' \) -delete 2>/dev/null || true
find "$OUT/node_modules" -type l ! -exec test -e {} \; -delete 2>/dev/null || true
du -sh "$OUT" | awk '{print "   unpacked:", $1}'

echo "▸ smoke test (with Lambda's module flags)"
node --no-experimental-require-module --no-experimental-detect-module "$PWD/scripts/smoke-lambda.cjs" "$OUT"

echo "▸ zip"
# -y keeps pnpm's relative symlinks inside node_modules as symlinks (Lambda preserves them on extract)
(cd "$OUT" && rm -f lambda.zip && zip -qry lambda.zip . -x 'lambda.zip')
du -sh "$OUT/lambda.zip" | awk '{print "   bundle:", $1}'
