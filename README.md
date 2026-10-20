# Recall Studio

Keyboard-first active-recall study workstation. Import AI-generated question batches (8 question types) as JSON, study them with FSRS spaced repetition, take exams, keep per-round notes, and watch honest statistics. Sign in with Google (or a password-less dev login locally); every deck, review and note belongs to the signed-in user.

- **Web**: Next.js 16 (App Router) · React 19 · Tailwind 4 · Radix · next-themes (light/dark)
- **API**: NestJS 12 · Prisma 7 · MySQL 8 · [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (no interval math reimplemented)
- **Contract**: `packages/contracts` — JSON Schema 2020-12 + AJV validator + semantic checks + authoritative graders + shared types

> **Auth**: the web app signs users in with Auth.js (Google), mints a short-lived bearer token from the session (`GET /api/token`) and sends it on every API call. The API verifies it (`API_JWT_SECRET`, shared) and scopes every query to that user. Hosting for ~$0/month (Vercel Hobby + AWS Lambda + TiDB Cloud Starter): see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Quick start

Requirements: Node ≥ 22, pnpm ≥ 8, Docker (for MySQL) — or a local MySQL 8 you can point `DATABASE_URL` at.

```bash
pnpm install                      # also builds packages/contracts
pnpm db:up                        # MySQL 8.4 in Docker on 127.0.0.1:3306 (user recall / recall, db recall_studio)
cp apps/api/.env.example apps/api/.env   # dev secrets + AUTH_DEV_LOGIN=1 (password-less local login)
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate                   # prisma migrate dev (creates tables; needs CREATE for the shadow DB — granted by docker/init.sql)
pnpm db:seed                      # imports examples/example-question-batch.json (all 8 types) for the dev user dev@local
pnpm dev                          # web http://localhost:3000 · api http://localhost:4000 · Swagger http://localhost:4000/docs
```

Open http://localhost:3000 → **개발용 로그인** with `dev@local` to see the seeded deck (any e-mail creates a fresh user). Google sign-in works locally too once `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set (redirect URI `http://localhost:3000/api/auth/callback/google`).

If you already run MySQL locally, create the database/user yourself and set `DATABASE_URL` (and `TEST_DATABASE_URL` for integration tests) in `apps/api/.env`.

## Generating questions with an LLM

1. Press **LLM 프롬프트** in the top bar (any page) → *프롬프트 + 스키마* copies `docs/QUESTION_GENERATOR_PROMPT.md` with the JSON Schema attached.
   Deck id/title/subject default to `auto` (the LLM derives them from the materials or topic; an unknown id becomes a new deck on import). Two modes: **제공된 자료 모드** (attach PDFs/notes with the prompt) and **일반 지식 모드** (no materials: enter a main topic, subtopics one per line, and an optional audience level on `/prompt`).
   The prompt's CONFIG block (question count, output language, difficulty and type mix, choice count, …) is filled from your saved defaults (**설정 → LLM 프롬프트 기본값**, stored as `Settings.promptDefaults`; only values that differ from the document are saved). For a one-off change, open **프롬프트** (`/prompt`, or *옵션 조정해서 복사…* in the same menu): adjust with sliders and fields, see the resulting CONFIG, copy, and optionally save those values as the new defaults.
2. Paste it into your LLM together with a PDF / lecture notes / topic. The LLM must answer with one JSON object.
3. Open **가져오기** (`/import`), paste the JSON, **검증** (client schema check → server schema + semantic + diff preview), then **가져오기 확정**.

Re-importing the same JSON is idempotent. Changed prompt text keeps scheduling; a changed *answer key* resets that card's schedule (reported before commit). Strategies: `upsert` (default), `add_only`, `replace_deck`.

## Studying

`/study/<deckId>` (or `/study/all`, `?subject=…`, `?mode=cram|mistakes|flagged|practice`, `?tags=`, `?types=`, `?difficultyMin=`…)

| Key | Before submit | After reveal |
|---|---|---|
| `1`–`9` | choose option (TF: 1 = O, 2 = X) | `1`–`4` = Again / Hard / Good / Easy |
| `Enter` | submit (textarea: newline; `⌘/Ctrl+Enter` submits) | — (`N` = next when auto-advance is off) |
| `Space` | reveal without answering | toggle explanation |
| `E` | — | toggle explanation |
| `U` | undo last rating (restores FSRS state + log) | same |
| `H` / `M` / `F` / `I` / `S` | hint / note (this round) / flag / card info / bury until tomorrow | same |
| `?` / `⌘K` | shortcuts help / command palette | same |

Shortcuts never fire inside inputs, textareas or during Korean IME composition.

**Correct/incorrect ≠ FSRS rating.** The app shows the verdict and explanation, then *you* rate recall difficulty; that rating is what ts-fsrs schedules from. Exam and practice modes never touch scheduling.

### Notes per review round
Every question keeps one note per **review round** (round N = the N-th effective review). Press `M` while studying; earlier rounds are listed with the rating they were written under, and the deck page has a notes tab.

## Question types (8 core + 8 extended)

| Core (unchanged since v1.0.0) | Extended (additive; the LLM uses them only when the content fits) |
|---|---|
| `single_choice`, `multiple_choice`, `true_false`, `short_answer`, `essay`, `cloze`, `ordering`, `matching` | `numeric` (value ± tolerance, unit), `cloze_select` (dropdown blanks), `statement_set` (several T/F statements), `categorize` (items → categories), `two_tier` (answer + reason), `recall_card` (front/back self-check, optional auto-grade), `stepwise` (chained sub-answers graded per step), `highlight` (select passage segments) |

All sixteen are graded server-side with per-part feedback; `essay` and `recall_card` (without accepted answers) are self-assessed and excluded from auto-graded accuracy. Where position carries no meaning the view is shuffled every review round (choices, reasons, statements, category items, dropdown options, matching right column) so answers cannot be memorised by place; sequences and passages are never shuffled. `examples/example-extended-batch.json` shows one of each extended type. Existing JSON batches keep working unchanged.

## Desktop app (PWA)

The web app is an installable Progressive Web App: web manifest (`app/manifest.ts`), icons in `public/icons` (regenerate with `node scripts/gen-icons.mjs` inside `apps/web`), a service worker (`public/sw.js`: app shell + static assets cached, navigations network-first with an `/offline` fallback, **API responses never cached**) and an install button in the header/Settings that uses the browser's `beforeinstallprompt`. The service worker registers only in production builds, so install from a production server:

```bash
pnpm --filter @recall/web build && pnpm --filter @recall/web start   # http://localhost:3000 (stop `pnpm dev:web` first, or use `next start -p 3001`)
```

Then use Chrome/Edge's address-bar install icon (or Settings → "앱으로 설치"). The installed app still talks to the local API on port 4000.

## Rich content in any text field

Prompts, options, items, statements, segments, explanations, hints, model answers, rubric guidance and notes all go through one Markdown renderer: GFM (tables, lists, task lists), fenced code with syntax highlighting and a copy button, KaTeX (`$…$`, `$$…$$`, chemistry via `\ce{}`), ```` ```mermaid ```` diagrams (flowchart, sequence, state, class, ER, gantt, pie, mindmap, timeline; rendered client-side with `securityLevel: strict`), ```` ```svg ```` inline vector graphics (sanitized with DOMPurify: no scripts, no external references), images by URL or `data:image/…;base64`, and raw HTML sanitized against an allowlist (`apps/web/components/questions/sanitize-schema.ts`: tables with row/col spans, `mark`, `sup/sub`, `details/summary`, `ruby`, `style` attributes, inline SVG; scripts, iframes, forms, event handlers and `javascript:` URLs are stripped). The generator prompt tells the LLM to use these only when the content is better assessed that way, never decoratively, and to keep option representations balanced.

## LaTeX

Every text field (prompt, choices, choice explanations, explanation summary/steps/misconceptions, hints, model answers, rubric criteria/guidance, ordering items, matching pairs, cloze text, notes) renders Markdown + LaTeX via KaTeX: `$...$` inline, `$$...$$` display. The generator prompt tells the LLM to use exactly that notation (double-escaped backslashes inside JSON) and to write questions in the dominant language of the attached materials unless `OUTPUT_LANGUAGE` is set. `examples/example-latex-batch.json` is a six-question math deck covering all of it. Accepted answers for short-answer/cloze stay plain strings (typed by the learner, compared after normalization).

## Data manager (`/data`)

Every entity (decks, questions, FSRS card states, review logs, per-round notes, subjects, question–subject links, study sessions, practice logs, exam attempts, exam responses, settings) has a generic table: text search, per-field filters (contains / equals / numeric and date ranges), column sort, paging, live/deleted/all toggle, row editing in a dialog, create (where it makes sense), soft delete + restore, permanent delete, and multi-select bulk actions (delete / restore / permanent / set one field on all selected). Question payload edits are re-validated against the schema and semantic rules; an answer-key change resets that card's schedule. Backed by `GET/POST/PATCH/DELETE /admin/:entity[/:id]`, `POST /admin/:entity/bulk`, `GET /admin/entities`, `GET /admin/counts`.

## Features
Dashboard · decks grouped by subject · tag-like **subjects** (a question can belong to many) · 8 renderers with authoritative server grading · explanation/steps/misconceptions/sources on the same screen · FSRS rating bar with next-interval preview · undo · hints · flag / suspend / bury / reset · custom study (cram, mistakes, flagged, practice, tags, types, difficulty, cross-deck, by subject) · exam mode with timer, filters, essay rubric self-scoring, retry-wrong-only, history · Insights (daily series, due forecast, per-type accuracy with denominators, grade distribution, FSRS difficulty/stability, estimated retention labelled as an estimate, streaks, leeches, hardest questions, heatmap) · settings (daily limits, timezone, FSRS retention/interval/fuzz, shortcuts, theme) · deck JSON export (schema-valid) · full backup/restore · review CSV · command palette · shortcut help · light/dark mode.

## Accounts & ownership

`User` rows are created on first authenticated request (identity = provider + provider id: Google `sub`, or the e-mail for the dev login). Every other table carries `userId`; every service method takes the user id and every query is scoped by it, and `PrismaService` wraps the client in a tenant guard that throws if a tenant model is ever queried without `userId`. Deck ids are internal cuids; the batch's `deck.id` is stored as `slug`, unique per user, so two people can import the same batch. Settings, subjects and review idempotency keys are per user as well. Backups (`/settings`) export one user's data (v2); restoring a v1 or v2 backup replaces the signed-in user's data with new ids and re-mapped foreign keys.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): TiDB Cloud Starter (DB) → Google OAuth client → `pnpm deploy:api` (Lambda + Function URL, `infra/aws/deploy-api.sh`) → Vercel project with the `ar.jaychang99.dev` domain via a Route53 CNAME → restore the local backup into your account.

## Project layout
```
apps/web            Next.js app (app/, components/, lib/shortcuts, e2e/; auth.ts = Auth.js config, proxy.ts = signed-out redirect)
apps/api            NestJS API (src/<module>, src/auth = bearer guard, prisma/schema.prisma, test/*.e2e-spec.ts, scripts/build-lambda.sh)
packages/contracts  schema, validator, semantic checks, graders, types (+ tests)
infra/aws           deploy-api.sh (Lambda + Function URL), .env.lambda.example
examples/           example-question-batch.json (8 types)
docs/               QUESTION_GENERATOR_PROMPT.md, DEPLOYMENT.md
docker/             init.sql (dev privileges + test DB)
```

## Scripts
| Command | What |
|---|---|
| `pnpm dev` / `pnpm dev:api` / `pnpm dev:web` | run |
| `pnpm lint` · `pnpm typecheck` · `pnpm build` | quality gates |
| `pnpm test` | contracts + api unit + web unit (Vitest) |
| `pnpm --filter @recall/api test:integration` | API integration tests against `TEST_DATABASE_URL` (migrates it, truncates between tests) |
| `pnpm test:e2e` | Playwright (needs web on :3000 and api on :4000 with `AUTH_DEV_LOGIN=1`; signs in as `e2e@test.local`) |
| `pnpm build:lambda` · `pnpm deploy:api` | Lambda bundle (`apps/api/lambda-dist/lambda.zip`, smoke-tested) · deploy to AWS |
| `pnpm db:migrate` · `pnpm db:generate` · `pnpm db:seed` · `pnpm db:reset` | Prisma |

## Troubleshooting
- **`P3014` shadow database** on `migrate dev`: the DB user needs `CREATE`. `docker/init.sql` grants it on first container start; for an existing container run `GRANT ALL PRIVILEGES ON *.* TO 'recall'@'%'`.
- **API 500 with `Cannot find module …/contracts/src/types.js`**: run `pnpm --filter @recall/contracts build` (postinstall does this).
- **Homebrew MySQL fails with `libicuuc` dyld error**: use Docker (`pnpm db:up`) or `brew reinstall icu4c mysql`.
- **Web shows "API에 연결할 수 없습니다"**: start the API (`pnpm dev:api`) and check `NEXT_PUBLIC_API_URL`.

## API (Swagger at `/docs`)
All routes except `GET /health` and `GET /schemas/*` require `Authorization: Bearer <api token>` and answer only with the caller's own data. `GET /auth/me` ·
`GET /health` · `GET/PATCH /settings` · `GET /decks`, `/decks/by-subject`, `/decks/:id`, `/decks/:id/questions`, `/decks/:id/notes`, `PATCH/DELETE /decks/:id`, `POST /decks/:id/restore` · `GET /subjects`, `POST /subjects`, `PATCH/DELETE /subjects/:id`, `POST /subjects/bulk-assign` · `GET /questions/:id`, `POST /questions/:id/grade`, `GET /questions/:id/answer-key`, `GET/PUT/DELETE /questions/:id/notes[/:round]`, `GET/PUT /questions/:id/subjects` · `POST /imports/validate`, `POST /imports/commit` · `GET /study/queue`, `POST /study/sessions`, `PATCH /study/sessions/:id/end`, `GET /study/hint/:id`, `POST /study/practice` · `POST /reviews`, `POST /reviews/:id/undo`, `GET /reviews?questionId=` · `POST /cards/:id/{flag,unflag,suspend,resume,bury,unbury,reset}`, `POST /cards/bulk` · `POST /exams`, `GET /exams`, `GET /exams/:id`, `POST /exams/:id/submit` · `GET /analytics/overview`, `GET /analytics/heatmap` · `GET /exports/decks/:id/batch.json`, `GET /exports/backup.json`, `POST /exports/restore`, `GET /exports/reviews.csv` · `GET /schemas/question-batch.schema.json` · `GET /admin/entities`, `GET /admin/counts`, `GET/POST /admin/:entity`, `GET/PATCH/DELETE /admin/:entity/:id`, `POST /admin/:entity/:id/restore`, `POST /admin/:entity/bulk`, `GET /admin/:entity/options`
