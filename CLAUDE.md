# Recall Studio — working notes for Claude Code

Monorepo (pnpm workspaces): `apps/web` (Next.js 16 App Router, React 19, Tailwind 4), `apps/api` (NestJS 12, Prisma 7 + MySQL 8, ts-fsrs 5), `packages/contracts` (JSON Schema + AJV + graders + types; single source of truth for the question contract).

## Commands
- `pnpm install` (postinstall builds `packages/contracts` to CJS for the API runtime)
- `pnpm db:up` (Docker MySQL 8.4 on 127.0.0.1:3306) → `pnpm db:migrate` → `pnpm db:seed`
- `pnpm dev` (web :3000 + api :4000), `pnpm --filter @recall/api dev`, `pnpm --filter @recall/web dev`
- Quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm --filter @recall/api test:integration` (needs `TEST_DATABASE_URL`), `pnpm test:e2e` (needs web + api running)
- `node scripts/sync-prompt.mjs` after editing `docs/QUESTION_GENERATOR_PROMPT.md` (web bundles the prompt for the Copy button).

## Rules of the codebase
- `packages/contracts/src/question-batch.schema.json` is the contract. Change schema + examples + semantic validator + renderers + tests + docs together, never one alone.
- Grading is server-authoritative (`POST /questions/:id/grade`); study/exam queues only ever return `toPublicQuestion()` (no answer keys).
- FSRS scheduling happens only in `apps/api/src/reviews/reviews.service.ts` inside one transaction (row lock → ts-fsrs `next` → review log insert → optimistic version bump). Never reimplement interval math. Exam/practice modes never write ReviewLog.
- Every entity has `createdAt/updatedAt/deletedAt`; delete = set `deletedAt` (soft). Queries filter `deletedAt: null`.
- Subjects are tag-like (`Subject` ⟷ `QuestionSubject`); the deck subject is auto-assigned on import (`source = "deck"`).
- Notes are one per `(questionId, reviewRound)`; round = effective (non-undone) reviews + 1.
- Keyboard shortcuts go through `apps/web/lib/shortcuts` (single listener, scopes, IME/editable guards). Don't add ad-hoc `keydown` listeners.
- Design tokens: `apps/web/app/globals.css`; see `DESIGN.md` and `PRODUCT.md`.

## Gotchas
- Prisma 7 `prisma-client` generator emits TS into `apps/api/src/generated` (gitignored) — run `pnpm db:generate` after schema changes; `prisma migrate dev` needs CREATE privilege (shadow DB; granted in `docker/init.sql`).
- The API's integration tests truncate `recall_studio_test` and run `prisma migrate deploy` first.
- Homebrew MySQL 8.3 on this machine is broken (icu4c mismatch); use Docker.
