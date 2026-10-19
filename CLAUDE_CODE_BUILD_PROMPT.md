# Claude Code Master Build Prompt — Recall Studio

> Paste this entire file into Claude Code in a new project, or reference it as `@CLAUDE_CODE_BUILD_PROMPT.md`. Supply `@question-batch.schema.json` and `@example-question-batch.json` alongside it. **Implement code; do not just return a plan.**

당신은 senior full-stack engineer, learning-science engineer, product designer, accessibility/keyboard UX specialist, QA engineer를 겸임한다. 현재 작업 디렉터리에 **Recall Studio**라는 개인용/local-first 웹 학습 도구를 **실제로 구현**하라. Anki의 spaced repetition과 시험 시스템의 다양한 문항 유형을 결합하되, 빠른 키보드 중심 학습이 핵심 경쟁력이다. 시각적 완성도는 사용 가능한 제품 수준으로 구현한다.

## 0. 실행 방식 / 절대 규칙

1. 설명·계획만 제출하지 말고 실제 프로젝트 파일 생성, 의존성 설치, DB migration/seed, 서버 실행 가능한 상태, 테스트 실행까지 완료한다. `README.md`와 `CLAUDE.md`, `.env.example`을 만든다.
2. 먼저 이 저장소와 환경을 검사하고, 이미 존재하는 파일은 파괴하지 않는다. `pnpm`, Node.js >= 22, MySQL local의 이용 가능 여부를 확인한다. DB가 없거나 설치·기동 권한이 없으면 `.env.example`, migration 및 재현 가능한 기동 안내를 준비하고 DB 의존 테스트와 불가능한 단계는 정직하게 보고한다. 거짓으로 성공을 주장하지 않는다.
3. 사용자에게 중간중간 승인을 반복 요구하지 않는다. 안전한 로컬 개발 기본값으로 결정하고 실행한다. 파괴적 작업(기존 DB 삭제 등)은 수행하지 않는다.
4. 모델·SDK 버전은 직접 공식 문서를 확인하고 호환 가능한 현재 stable을 선택한다. package manager는 `pnpm`으로 통일하고 lockfile을 커밋 가능한 형태로 남긴다.
5. 출력물은 정적 목업이나 TODO placeholder가 아니라 실제 DB-backed end-to-end 기능이어야 한다. 시각 품질뿐 아니라 데이터 정확성과 학습 흐름을 최우선한다.
6. 제공된 `question-batch.schema.json`을 **계약의 단일 원천(source of truth)**으로 사용한다. 임의로 호환되지 않는 JSON 형태로 바꾸지 않는다. 필요한 개선이 있으면 schema, examples, import validation, frontend, tests, docs를 한 번에 바꾼다.
7. 기능을 축소해야 한다면 명시적으로 보고하되, 아래 P0 요구사항 전체를 먼저 충족한다. API 기능에 비해 UI 완성도가 낮아지지 않도록 vertical slice 단위로 진행한다.

## 1. 기술 스택 및 프로젝트 구조

- Monorepo: `pnpm workspaces` (+ Turborepo 선택 가능, 복잡성만 늘린다면 불필요).
- `apps/web`: 최신 안정 Next.js App Router + React + TypeScript strict + Tailwind CSS. 접근성 있는 UI primitive로 shadcn/ui + Radix; Lucide icons; 단색 아이콘 사용. React Hook Form은 필요한 곳에만.
- `apps/api`: NestJS + TypeScript, REST, Swagger/OpenAPI, Prisma ORM + MySQL 8 local. API 입력 DTO 검증, 공통 예외처리, 구조적 에러 응답.
- `packages/contracts`: 제공된 JSON Schema Draft 2020-12, AJV 2020 validator (with `ajv-formats` for URI formats), shared TS types (가능하면 json-schema-to-ts). 런타임과 타입을 반드시 같은 schema에서 파생. import data를 잘못된 타입으로 무조건 cast하지 않는다.
- Study scheduler: 정식 `ts-fsrs` 패키지 (최근 API 검증), 서버에서만 authoritative scheduling 수행. 라이브러리 FSRS 상태와 review log를 보존하고 수학식이나 interval을 임의로 구현하지 않는다.
- Tests: Vitest/Jest unit+API integration, Playwright E2E (Chromium, 키보드 포함). 데스크톱과 모바일 viewport 모두 점검.
- 웹 3000, API 4000 예시, DB는 `localhost:3306`. CORS는 로컬 개발 origin 제한. API는 localhost bind 기본. 로컬 단일 프로필 MVP; 가입·로그인·클라우드·외부 AI API·결제 필요 없음. 향후 멀티프로필을 고려한 schema 분리는 허용.
- Timezone: due timestamp는 DB/서버 UTC, 화면 day boundary는 기본 `Asia/Seoul` (설정 가능). 날짜 비교는 클라이언트 기기 시간만 신뢰하지 않는다.

제안 구조:
```
apps/web/app/{page.tsx,decks/[deckId]/page.tsx,study/[deckId]/page.tsx,exam/[deckId]/page.tsx,import/page.tsx,analytics/page.tsx,settings/page.tsx}
apps/web/components/{study,questions,layout,import,analytics}
apps/api/src/{decks,questions,imports,study,reviews,analytics,settings,prisma}
packages/contracts/src/{question-batch.schema.json,...}
prisma migrations, test fixtures, scripts, docs
```

## 2. 디자인 에이전트 설치 및 활용 (검증된 설치 경로)

코딩 전 다음을 확인하고 프로젝트에 사용 가능한 경우 설정한다. **Claude Code slash 명령은 shell 명령이 아니므로 Claude Code 명령 입력란에서 실행한다**. 자동 설치가 불가능하면 수동 설치 명령과 이유를 명확히 표시하고, 파일 기반 디자인 지침으로 구현을 계속한다. 서드파티 repository / installer script는 실행 전 검토한다.

1. **Anthropic Official Frontend Design** (foundation): Claude Code 내부에서 `/plugin install frontend-design@claude-plugins-official`. 공식 marketplace가 없다면 `/plugin`에서 공식 marketplace를 찾고 필요한 경우 `/plugin marketplace add anthropics/claude-plugins-official`. 설치가 실패하더라도 디자인 퀄리티 작업을 중단하지 않는다.
2. **Impeccable** (critique/audit/polish): 프로젝트 root에서 `npx impeccable install --providers=claude --scope=project` (지원 옵션 사전 확인). 대안: Claude Code 내부에서 `/plugin marketplace add pbakaus/impeccable` 뒤 `/plugin`에서 설치. 설치 후 `/impeccable init`으로 `PRODUCT.md` 생성 및 `DESIGN.md` 작성. UI 완성 후 `/impeccable audit`, `/impeccable critique`, `/impeccable polish`, `/impeccable distill` 실행/동등한 체크리스트 적용. `PRODUCT.md` 내용은 실제 제품 요구사항에 맞춘다.
3. **Taste Skill (Leonxlnx)**: Claude Code 내부 `/plugin marketplace add Leonxlnx/taste-skill` 후 `/plugin install taste-skill@taste-skill`. 대안 `npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend`. 이 플러그인은 영감·비평용이고 다음의 구체적 디자인 시스템을 덮어쓰지 않는다.
4. **추가 후보: UI UX Pro Max** (검증 가능한 대체): `npx ui-ux-pro-max-cli init --ai claude` 또는 공식 marketplace를 확인해 설치. 다른 디자인 지침과 충돌한다면 이것까지 반드시 설치할 필요는 없다. 보안 검토와 재현 가능한 설정을 우선한다.
5. 우선순위: **이 제품 명세 + 접근성/키보드 규칙 > PRODUCT.md/DESIGN.md > 디자인 skill 영감**. 설치 수량보다 실제 rendered screenshot 품질이 중요하다.

## 3. 디자인 브리프: 고급 학습 워크스테이션

브랜드: **Recall Studio**. 사용 맥락: 수백~수천 개의 AI 생성 문제를 매일 30~120분 빠르게 푸는 개인 학습자. 중심 테마: '집중을 방해하지 않는 professional learning instrument' — Anki의 정보 밀도와 Linear/Raycast급 키보드 조작감을 결합한 느낌. 유명 서비스를 그대로 복제하지 않는다.

- 기본 라이트 모드 + 완성도 높은 다크 모드. 의도적인 색상 token(배경/텍스트/보더/상태/성공/오답/강조), 타이포 스케일, spacing grid, 아이콘 체계, 집중형 레이아웃. 한국어와 영어가 모두 자연스럽게 읽혀야 한다.
- 금지: generic gradient hero, 보라-파랑 그라디언트 남용, 흐릿한 glassmorphism, 불필요한 floating dashboard cards, 카드 안의 카드, 의미 없는 장식용 통계, 과한 애니메이션, 전형적인 AI landing-page 디자인, 반응형에서 깨지는 고정 폭.
- 사용자 정보 구조: Dashboard / Decks / Study / Exam / Import / Insights / Settings. 실제 내용이 있는 empty state, 즉시 동작하는 UI, loading/error/retry 상태. skeleton은 필요한 곳에만.
- 가장 중요한 Study 화면: 사이드바/상단크롬을 최소화한 single-column focus canvas, 진행도 + 남은 문제 + 키보드 도움말, 넉넉한 문제 본문 폭(~760–860px), 문제 답변 영역, 명확한 제출/정답공개 동작, 정답 공개 직후 바로 이어지는 근거·오답해설, 평가 버튼의 선명한 시각적 우선순위. 설명을 찾아 다른 화면으로 이동할 필요가 없다.
- 색만으로 정오를 구분하지 않는다. 명시적인 텍스트/아이콘을 함께 사용한다. focus-visible, WCAG AA 수준 contrast, aria-label/live-region, reduced-motion. textarea에서는 단축키로 답변을 훔치지 않는다.
- desktop 1440px / laptop 1280px / tablet 768px / mobile 390px의 실제 스크린샷을 보고 차이를 조정. 인터랙션 100ms 이내 응답 목표(로컬 환경 기준, 측정 전 달성 주장 금지). 거슬리는 애니메이션은 사용하지 않는다.
- 필요하다면 폰트 2종을 신중히 선택하되 네트워크 실패시 fallback과 한글 가독성 확보. Google Fonts CDN 연결이 필수 조건이 아니어야 한다.

## 4. 지원 문항 유형 (P0: 8종 모두 **실제** 풀이 지원)

제공 schema의 question.type을 그대로 따른다.

1. `single_choice`: 단일 정답 객관식; 보기 선택, 제출, 정답과 선택 보기 비교, 해설.
2. `multiple_choice`: 복수 정답 객관식; 체크박스/토글, 선택 완료 후 제출, 순서 무관한 집합 일치만 완전 정답. 부분 정답률은 상세 피드백만 제공하고 자동 정답으로 인정하지 않는다.
3. `true_false`: O/X 또는 True/False. `answer.value` boolean. 키보드 1/2.
4. `short_answer`: 하나 이상의 정확한 acceptedAnswers; 기본 trim/Unicode NFKC/collapse whitespace/case-fold 등 schema normalization을 정확히 적용. **semantic equivalence/수학식 동치/동의어를 임의로 오토채점하지 말 것**. 비정확한 답안은 self-check 가능. Korean IME composition 동안 Enter submit 금지.
5. `essay`: 자유 서술 + modelAnswer + rubric. 자동 AI 채점이 아닌 자기평가(manual self-check)와 루브릭 체크 및 모범답안 비교. 입력 내용, 평가 점수 저장.
6. `cloze`: `{{b1}}`, `{{b2}}` 형태의 fill-in-the-blank; 모든 blank의 acceptedAnswers와 id가 매칭. 여러 입력 간 focus 이동 지원.
7. `ordering`: 섞인 item을 올바른 순서로 배열. 키보드 접근성 있는 move up/down 버튼/단축키를 제공; drag & drop은 optional. stable item ID로 채점.
8. `matching`: 좌/우 항목 1:1 연결; 키보드로 각 좌측 항목에 우측을 select 가능. stable pair ID 기반 정확 채점.

모든 문항 공통: Markdown(GFM 일부, 수식은 KaTeX 필요시) 안전 렌더링, `prompt`·해설 즉시 표시, 문항 유형에 따른 보기/문장/정답 영역, difficulty/tags, 해설의 `summary`·`steps`·`misconceptions`·source를 적절히 노출. `explanation`은 정답 제출/공개 직후 같은 화면에 나타나야 한다. 보기는 shuffle해도 answer choice IDs는 변하지 않는다. 코드 펜스 복사 버튼 지원.

## 5. 키보드 퍼스트 UX (P0)

문항 상태 머신: `answering → submitted/revealed → rated → next`. 진행 상태가 아니라면 무관한 단축키는 작동하면 안 된다. shortcut scope manager를 별도 훅/모듈로 추상화해 **input/textarea/contenteditable, IME composition, modal, screen reader 단축키 충돌**을 처리하고 테스트한다.

- `1`–`9`: 선택지 또는 TF/단축 선택 (input 포커스 바깥에서만). 복수정답은 토글. 보기 9개 초과는 마우스/탭으로 접근 가능하고 키보드 focus nav 지원.
- `Enter`: 답안 입력 완료 시 제출 (textarea에서는 기본 줄바꿈, `Ctrl/Cmd+Enter` 제출). Korean IME composition일 때 제출하지 않음.
- `Space`: 답 미입력/암기형 자가평가 흐름에서 정답 공개; 제출 후에는 설명 패널을 여닫되 중복 리뷰/다음 문제 실수 방지. 버튼 포커스 시 native Space/Enter 동작을 침범하지 않는다.
- 정답/해설을 확인한 뒤 `1` Again / `2` Hard / `3` Good / `4` Easy. 선택지 단계에서 동일한 숫자키와 충돌하지 않게 상태로 구분. 등급을 누르면 1회만 서버에 기록하고 자동 다음 문제; 연타/요청 중 중복 방지.
- `N` 다음(이미 rated 상태에서만), `E` 해설 토글 (답변 공개 뒤), `?` shortcut overlay, `Esc` 팝오버/모달 닫기, `/` deck/search 입력에 focus(학습 화면 외).
- `U` undo last rating (최근 리뷰 1건을 정확하게 복원: review log 및 FSRS state 복구; 단순 화면만 이전으로 돌리면 안 됨). 오류나 동시성 발생 시 사용자가 이해할 수 있는 메시지.
- 마우스로도 모든 동작 가능. 버튼마다 shortcut hint를 표시하되 화면이 산만해지지 않게. 설정 화면에서 간단 shortcut preset/단축키 끄기 설정 가능하면 좋음.
- 앱 레벨의 keydown 이벤트 핸들러 중복 등록 금지. Event.repeat와 key modifiers를 무시해야 하는 경우 명시.

## 6. 학습 흐름 / FSRS 정확성 (P0)

- 초기 카드: 문제별 FSRS Card를 생성. `ts-fsrs` API(현재 문서)의 `createEmptyCard`, `fsrs()`, `Rating.Again/Hard/Good/Easy`, `scheduler.next(...)` 를 올바르게 사용.
- **오답/정답 판정 != FSRS rating**. 기본적으로 자동 정답 판정 여부를 보여주되 모든 유형에 동일하게 **사용자가 회상 난이도를 Again/Hard/Good/Easy로 결정**하도록 한다. 선택적으로 향후 설정에서 자동 추천을 넣을 수 있으나 MVP의 저장 주체는 user-rated이다. 정답을 보지 않고 recall했는지 여부(`revealedBeforeAnswer`) 및 힌트 사용 여부를 로그에 남긴다.
- Study 세션은 new, learning, review due를 수집해 queue 구성; 설정 가능한 일일 신규 카드 상한(기본 20) 및 review 상한(기본 200), due 우선, queue 순서는 안정적. 하루에 같은 카드 중복 노출은 FSRS learning/relearning due 예외만 허용.
- `GET /study/queue?deckId=...`는 진행 가능한 문항 + 카드 상태를 리턴. `POST /reviews`는 서버 측 **하나의 DB transaction**에서 중복검사 → 기존 state 확인 → FSRS `next` 계산 → review log insert → card state update. `idempotencyKey`와 최신 card version optimistic concurrency로 중복 등급/레이스 방지. 재시도 시 중복 기록 금지. `DELETE /reviews/:id` 대신 `POST /reviews/:id/undo`로 마지막 기록만 되돌리는 정책; undo 후 최신 상태 일치 검증, previous snapshot 복구.
- 스케줄의 due 날짜, interval, retrievability/difficulty/stability(라이브러리 지원 범위), status NEW/LEARNING/REVIEW/RELEARNING를 저장. FSRS state는 JSON or explicit Prisma fields, 그리고 library version 유지. state round trip이 확실히 복원되도록 테스트.
- Exam mode는 전혀 다른 목적: 모든 문항 유형, 문제 수/섞기/태그/난이도/제한 시간, 제출 후 점수 및 오답 분석. **기본적으로 Exam 풀이가 FSRS scheduling을 바꾸면 안 된다.** `essay`는 채점 대기/manual 항목이므로 정확도 denominator에서 분리해 '객관 채점 가능한 문항만' 퍼센트를 산출. 가능하면 exam history 저장.
- Analytics: 오늘 due/new/reviewed, 7일/30일 review count, 정답률(자동채점 가능 문항 한정), 유형별 오답률, grade distribution, streak, Deck별 진행률. 지표의 분모를 UI에 명확히 표시. retained knowledge/retrievability는 FSRS 추정치로 라벨을 달고 실제 정답률과 혼동하지 않는다. 실제 데이터 없으면 차트에 임의 값 만들지 않는다.

## 7. JSON 일괄 Import (핵심 P0)

사용자는 문제를 한 개씩 GUI에서 만들지 않는다. **별도 LLM이 생성한 JSON을 통째로 복사/붙여넣기** 한다.

- Import 페이지: large monospace code textarea + 붙여넣기 + JSON 파일 drag/drop/upload + `Validate` 버튼 + 정적 schema 링크/다운로드 + example JSON 복사 + validation errors list(가능한 경우 question index / JSON pointer / human-friendly message) + deck preview + 유형별 문제 수 + overwrite strategy 선택 + Import confirm.
- Import pipeline은 두 단계: (1) 클라이언트 빠른 schema validation, (2) 서버 동일 schema validation + **semantic checks** (중복 id, choiceId 참조, multiple_choice >=2 correct, `cloze` 모든 `{{id}}`와 blanks 일치, ordering item set == orderedIds, matching left/right/pair 참조 무결성 및 1:1 유일성, nonempty explanations, rubric maxPoints 합계, 동일 deck/question stable IDs). Schema만 통과했다고 semantic valid라고 주장하지 않는다.
- 미리보기에서는 answer key를 명확하게 검토할 수 있는 모드 제공; Study/Exam 미리보기에서 정답 누출 방지.
- `POST /imports/validate` preview/dry-run, `POST /imports/commit` confirm. 한번에 ≤5MB, ≤1000문항 제한 등 유효성 검증과 친절한 에러.
- transaction atomicity: invalid question 하나라도 있으면 **전체 commit 롤백**. 유효한 deck/질문이라도 partial upload 금지.
- upsert semantics: `deck.id`는 외부 stable slug, `question.id`는 deck 내 stable key. 같은 JSON 재가져오기 시 중복 생성 금지. 내용 불변은 skip. 내용 변경은 `revision/contentHash` 증가 및 새 문제 내용 반영, review history는 보존. **정답 의미가 변경된 문항은 기존 학습 scheduling을 초기화하고 그 사실을 사용자에게 report**; 표면적 오탈자 수정은 scheduling 보존. 삭제되지 않은 질문을 import 결과에서 임의 삭제하지 않는다. before/after 결과: created / updated / unchanged / resetSchedule / errors.
- API `/schemas/question-batch.schema.json` 제공, repo fixture `examples/example-question-batch.json`에 8종 포함. 잘못된 JSON 예제도 unit test fixture로 제공. schemaVersion `1.0.0`만 우선 지원, 다른 버전 명시적으로 거부/에러.
- 외부 생성 LLM에 보내는 prompt `QUESTION_GENERATOR_PROMPT.md`를 `docs/`에 복사하고 Import 페이지에 복사 버튼을 제공.

## 8. DB 모델과 API (구현 후 Swagger 생성)

최소 entities: `Deck(id, title, description, subject, language, tagsJson, createdAt, updatedAt)`, `Question(id internal, externalId, deckId, type, payloadJson, contentHash, answerHash, revision, active, timestamps)`, `CardState(questionId unique, stateJson, dueAt, status, version, timestamps)`, `ReviewLog(id, questionId, idempotencyKey unique, rating, timestamp, elapsedMs, isCorrect nullable, revealedBeforeAnswer, hintUsed, answerPayloadJson, previousCardStateJson, resultingCardStateJson, schedulerVersion)`, `StudySession`, `ExamAttempt/ExamResponse`, `AppSettings`.

- Use MySQL appropriate indexed compound keys: `(deckId, externalId)` unique, `(dueAt, status)`, `(deckId, type)`, review `(questionId, reviewedAt)`, session references.
- Avoid MySQL limitations (JSON query/index assumptions). Use Prisma validated JSON serialization; avoid storing undefined/NaN.
- Example routes: `GET /health`, `GET /decks`, `GET /decks/:id`, `GET /decks/:id/questions` (pagination/filter), `POST /imports/validate`, `POST /imports/commit`, `GET /study/queue`, `POST /reviews`, `POST /reviews/:id/undo`, `POST /exams`, `POST /exams/:id/submit`, `GET /analytics/overview`, `GET/PATCH /settings`. Use concrete DTOs and OpenAPI.
- API's scoring/grading is authoritative (client data only a candidate). Import markdown render sanitize; no arbitrary HTML execution. Backend reject unsafe prototype keys in untrusted JSON and enforce size/limits. `localhost` development scope, no auth; **README must warn not to expose API publicly**.

## 9. 구현 순서 (실제로 완료할 것)

Phase A. Env inspection, repo scaffold, config, MySQL Prisma schema/migration, shared JSON Schema+validator, sample fixture. Ensure install and typecheck pass.

Phase B. Import preview/validation/upsert semantics + Deck list/detail. Demonstrate importing the sample JSON and reimport idempotency.

Phase C. All 8 question renderers/graders, answer state machine, explanation UI. Explain every answer type in one screen.

Phase D. FSRS + durable transactional review logs + undo + due queue. Keyboard shortcuts and accessibility.

Phase E. Exam mode + analytics + settings. Quality polish through visual review.

Phase F. Automated QA, `README` setup, troubleshooting, precise verification report.

For quality gates, run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm test:e2e` (or clearly report impossible due to missing local MySQL/browser). Do not announce passes unless output actually confirms.

**Required tests**:
- AJV schema accepts example fixture; rejects unknown types, malformed answers, missing explanation, invalid id, unknown `schemaVersion`.
- Semantic validator rejects duplicate question/option ids, wrong refs, missing cloze blanks, wrong ordering/matching refs, rubric total inconsistent.
- Single choice & multiple choice correctness, shuffled options, short answer normalization, Korean input, essay manual grading, cloze/ordering/matching.
- Import idempotent twice; one invalid question rolls back whole batch; content edit preserves log; answer edit resets schedule.
- Review `Again/Hard/Good/Easy` produces library-defined due outcomes and saved state; double-click creates one log; idempotency retries do not duplicate; undo restores exact previous state.
- Keyboard: `1-9` selects before submit but grades after reveal; textarea typing doesn't grade; Esc closes modal; Korean IME Enter doesn't submit; keyboard-only navigation works end-to-end.
- Exam doesn't modify FSRS; essay excluded from objectively-scored accuracy denominator; mobile screenshot no clipping.

## 10. 종료 시 보고 형식

1. 실제 생성된 project tree 요약 및 주요 URL.
2. 실행 명령 (`pnpm install`, local MySQL create/start or Docker *optional*, `.env` setup, `pnpm db:migrate`, `pnpm dev`).
3. 각 feature 실구현 여부의 표(P0/P1), 테스트의 정확한 결과 및 못한 검증과 그 사유.
4. 8종 sample JSON을 import한 뒤 핵심 화면에 도달하는 예시 동선.
5. 향후 발전 방향은 별도 P1로 짧게(LLM integrated question generation, FSRS optimizer, sync, images). 완료되지 않은 것을 완료했다고 말하지 말 것.

**이제 작업 디렉터리를 검사하고 실제 코드를 작성하라. 계획 문서만 작성하는 것으로 끝내지 말라.**
