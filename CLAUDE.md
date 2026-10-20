# Recall Studio — working notes for Claude Code

Monorepo (pnpm workspaces): `apps/web` (Next.js 16 App Router, React 19, Tailwind 4), `apps/api` (NestJS 12, Prisma 7 + MySQL 8, ts-fsrs 5), `packages/contracts` (JSON Schema + AJV + graders + types; single source of truth for the question contract).

## Commands
- `pnpm install` (postinstall builds `packages/contracts` to CJS for the API runtime)
- `pnpm db:up` (Docker MySQL 8.4 on 127.0.0.1:3306) → `pnpm db:migrate` → `pnpm db:seed`
- `pnpm dev` (web :3000 + api :4000), `pnpm --filter @recall/api dev`, `pnpm --filter @recall/web dev`; local sign-in = dev login (`AUTH_DEV_LOGIN=1`, any e-mail; seed uses `dev@local`)
- Quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm --filter @recall/api test:integration` (needs `TEST_DATABASE_URL`), `pnpm test:e2e` (needs web + api running)
- `node scripts/sync-prompt.mjs` after editing `docs/QUESTION_GENERATOR_PROMPT.md` (web bundles the prompt for the Copy button).

## Rules of the codebase
- Auth + ownership: the web mints an HS256 bearer token from the Auth.js session (`apps/web/app/api/token`, shared `API_JWT_SECRET`); `apps/api/src/auth/auth.guard.ts` (global `APP_GUARD`) verifies it and resolves `req.user`. Only `/health` and `/schemas/*` are `@Public()`. Every service method takes `userId` first and every Prisma `where`/`data` carries it; `PrismaService` has a tenant-guard extension that throws otherwise (raw SQL must add `userId` by hand). `Deck.id` is a cuid, the batch's `deck.id` lives in `Deck.slug` (unique per user). Never add a query path that skips the user scope.
- Deployment: `docs/DEPLOYMENT.md` (Vercel Hobby + Lambda via `infra/aws/deploy-api.sh` + TiDB Starter). `apps/api/scripts/build-lambda.sh` prunes the bundle and smoke-tests the handler; keep it under the 50 MB zip limit.
- `packages/contracts/src/question-batch.schema.json` is the contract. Change schema + examples + semantic validator + renderers + tests + docs together, never one alone.
- Grading is server-authoritative (`POST /questions/:id/grade`); study/exam queues only ever return `toPublicQuestion()` (no answer keys).
- FSRS scheduling happens only in `apps/api/src/reviews/reviews.service.ts` inside one transaction (row lock → ts-fsrs `next` → review log insert → optimistic version bump). Never reimplement interval math. Exam/practice modes never write ReviewLog.
- Every entity has `createdAt/updatedAt/deletedAt`; delete = set `deletedAt` (soft). Queries filter `deletedAt: null`.
- Subjects are tag-like (`Subject` ⟷ `QuestionSubject`); the deck subject is auto-assigned on import (`source = "deck"`).
- Notes are one per `(questionId, reviewRound)`; round = effective (non-undone) reviews + 1.
- Keyboard shortcuts go through `apps/web/lib/shortcuts` (single listener, scopes, IME/editable guards). Don't add ad-hoc `keydown` listeners.
- Design tokens: `apps/web/app/globals.css`; see `DESIGN.md` and `PRODUCT.md`.
- Question types: 8 core + 8 extended (`numeric`, `cloze_select`, `statement_set`, `categorize`, `two_tier`, `recall_card`, `stepwise`, `highlight`). Adding a type touches: schema `$defs` + `oneOf`, contracts types/semantic/grade/public, API `answerKeyOf` + Prisma enum + admin enum list, a web renderer + dispatcher + `TYPE_LABEL` + deck `AnswerSummary` + study `hasAnswer`, the generator prompt, an example, and tests. Never change the core eight.
- Shuffle view order per review round wherever position is meaningless (`seededShuffle` with `${questionId}:${shuffleSeed}`); never for ordering/highlight/stepwise.
- All text surfaces render through `components/questions/markdown.tsx` (GFM + KaTeX). Never print question text as a raw string.
- The generic data manager is metadata-driven: `apps/api/src/admin/entities.ts` (fields, filterable/editable/sortable flags) + `apps/web/components/data/data-manager.tsx`. Add a field there instead of hand-writing CRUD screens.

## Gotchas
- Prisma 7 `prisma-client` generator emits TS into `apps/api/src/generated` (gitignored) — run `pnpm db:generate` after schema changes; `prisma migrate dev` needs CREATE privilege (shadow DB; granted in `docker/init.sql`). `migrate dev` refuses non-TTY shells: generate SQL with `SHADOW_DATABASE_URL=… prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script` into a new `prisma/migrations/<ts>_<name>/migration.sql`, then `migrate deploy`.
- Local DB since the multi-tenant migration is `recall_studio_v2` (the old single-user `recall_studio` DB was left untouched; its backup is in `backups/`).
- The API's integration tests truncate `recall_studio_test` and run `prisma migrate deploy` first.
- Homebrew MySQL 8.3 on this machine is broken (icu4c mismatch); use Docker.
