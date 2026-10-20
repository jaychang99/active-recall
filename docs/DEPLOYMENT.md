# 배포 가이드 — ar.jaychang99.dev (월 $0 구성)

```
브라우저 ─ Google 로그인 ─▶ https://ar.jaychang99.dev   (Next.js, Vercel Hobby, Auth.js 세션 쿠키)
   │   GET /api/token  →  1시간짜리 HS256 JWT (API_JWT_SECRET)
   └── Authorization: Bearer ──▶ Lambda Function URL (NestJS, AuthGuard) ──▶ TiDB Cloud Starter (MySQL, TLS)
```

| 구성 요소 | 서비스 | 비용 |
|---|---|---|
| 웹 | Vercel Hobby (개인·비상업용) | $0 |
| API | AWS Lambda Node 22 arm64 + Function URL (프리티어: 월 100만 요청·40만 GB-s, 영구) | $0 |
| DB | TiDB Cloud Starter (5 GiB, 월 5천만 RU, MySQL 호환) | $0 |
| DNS | Route53 기존 호스팅존 (`jaychang99.dev`) | 기존 $0.50/월 |

유휴 후 첫 요청은 Lambda 콜드스타트로 1~3초 걸립니다. 이게 거슬리면 `MEMORY_MB`를 올리거나(프리티어 범위 안) Fly.io 소형 VM(월 $2~3)으로 옮기면 됩니다 — 같은 `lambda-dist` 번들은 아니지만 `pnpm --filter @recall/api build && node dist/main.js`로 어디서든 돕니다.

## 0. 한 번만 준비할 것

| 값 | 만드는 법 | 쓰이는 곳 |
|---|---|---|
| `API_JWT_SECRET` | `openssl rand -base64 32` | Lambda 환경변수 **와** Vercel 환경변수 (같은 값) |
| `AUTH_SECRET` | `openssl rand -base64 32` | Vercel 환경변수 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | 2단계 | Vercel 환경변수 |
| `DATABASE_URL` | 1단계 | Lambda 환경변수, 로컬에서 마이그레이션 실행 시 |

## 1. 데이터베이스 — TiDB Cloud Starter

1. https://tidbcloud.com 가입 → **Create Cluster → Starter** → 리전 **AWS ap-northeast-1 (Tokyo)** (Lambda와 같은 리전).
2. 인스턴스 → **Connect** → *Prisma* 탭의 연결 문자열을 복사. 형태:
   ```
   mysql://<prefix>.root:<password>@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/test?sslaccept=strict
   ```
   DB 이름은 `test` 대신 `recall_studio`로 바꾸고(콘솔 SQL Editor에서 `CREATE DATABASE recall_studio;`), `?sslaccept=strict`는 꼭 남깁니다 (Starter는 TLS 필수; API는 이 플래그를 보고 mariadb 커넥터에 TLS를 켭니다 — `apps/api/src/prisma/database-url.ts`).
   TiDB는 클러스터형 PK를 `DROP PRIMARY KEY` 할 수 없어서 `multi_tenant` 마이그레이션은 `Deck`/`AppSettings`를 재생성하는 방식으로 작성돼 있습니다. 앞으로 PK를 바꾸는 마이그레이션은 같은 방식으로 쓰세요.
3. 로컬에서 스키마 적용:
   ```bash
   DATABASE_URL='mysql://…/recall_studio?sslaccept=strict' pnpm --filter @recall/api db:deploy
   ```
   이후 스키마가 바뀔 때마다 같은 명령을 다시 실행합니다 (`prisma migrate deploy`는 멱등).

## 2. Google OAuth 클라이언트

1. https://console.cloud.google.com → 프로젝트 생성 → **APIs & Services → OAuth consent screen**: External, 앱 이름 "Recall Studio", 본인 이메일. 테스트 모드면 **Test users**에 쓸 사람들의 Google 계정을 추가 (게시하면 누구나 로그인 가능).
2. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorized JavaScript origins: `https://ar.jaychang99.dev`, `http://localhost:3000`
   - Authorized redirect URIs: `https://ar.jaychang99.dev/api/auth/callback/google`, `http://localhost:3000/api/auth/callback/google`
3. Client ID → `AUTH_GOOGLE_ID`, Client secret → `AUTH_GOOGLE_SECRET`.

## 3. API — AWS Lambda

필요: AWS CLI 로그인 (`aws configure` 또는 SSO), IAM 역할/Lambda를 만들 수 있는 권한.

```bash
cp infra/aws/.env.lambda.example infra/aws/.env.lambda   # DATABASE_URL, API_JWT_SECRET, WEB_ORIGIN 채우기
pnpm deploy:api                                          # 번들(apps/api/lambda-dist/lambda.zip) → 역할 → 함수 → Function URL
```

마지막 줄에 `API URL: https://xxxx.lambda-url.ap-northeast-1.on.aws/`가 출력됩니다. `curl <URL>health`가 `{"status":"ok","db":"ok"}`이면 끝. 코드를 바꾸면 같은 명령으로 재배포합니다 (환경변수도 `.env.lambda`에서 다시 읽어 덮어씁니다).

- 리전/이름/메모리는 `AWS_REGION`, `FUNCTION_NAME`, `MEMORY_MB`, `TIMEOUT_S` 환경변수로 바꿉니다.
- 런타임은 **Node.js 24** 이고 핸들러는 promise 방식입니다 (Node 24 런타임은 callback 시그니처를 거부). Lambda의 node는 `--no-experimental-require-module`로 뜨기 때문에 ESM 전용 패키지(NestJS 12, jose)는 `scripts/bundle-lambda.mjs`(esbuild)가 `index.js` 하나로 인라인하고, 나머지 CommonJS 패키지는 `node_modules`에서 상대 경로로 require 합니다. 빌드 스크립트의 smoke test는 같은 플래그로 돌립니다.
- 공개 Function URL은 2025년 10월부터 리소스 정책에 `lambda:InvokeFunctionUrl` **과** `lambda:InvokeFunction`(InvokedViaFunctionUrl) 두 문장이 모두 필요합니다 — 스크립트가 둘 다 추가합니다 (하나만 있으면 403).
- CORS는 앱 레벨(`WEB_ORIGIN`, 쉼표로 여러 개)에서 처리하므로 Function URL에는 CORS 설정을 넣지 않습니다.
- Swagger는 `<URL>docs`에서 열리고, 호출하려면 Authorize에 Bearer 토큰을 넣어야 합니다 (브라우저 DevTools → Network → 아무 API 요청의 `Authorization` 헤더에서 복사).

## 4. 웹 — Vercel + 도메인

1. https://vercel.com → **Add New → Project** → 이 GitHub 저장소 import.
   - Framework: Next.js (자동) · **Root Directory: `apps/web`** · Install Command 기본값(pnpm, 루트 `packageManager` 사용) · Build Command 기본값.
2. **Environment Variables** (Production + Preview):

   | 이름 | 값 |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | 3단계의 Function URL, **끝 슬래시 없이** (`https://xxxx.lambda-url.ap-northeast-1.on.aws`) |
   | `API_JWT_SECRET` | Lambda와 같은 값 |
   | `AUTH_SECRET` | 0단계 값 |
   | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | 2단계 값 |
   | `AUTH_URL` | `https://ar.jaychang99.dev` |

   `AUTH_DEV_LOGIN`은 **설정하지 않습니다** (설정하면 프로덕션 빌드가 거부합니다).
3. Deploy. 처음엔 `*.vercel.app` 주소로 열리고 Google 로그인은 redirect URI 불일치로 실패합니다 — 도메인을 붙이면 됩니다.
4. **Settings → Domains → `ar.jaychang99.dev` 추가**. Vercel이 보여주는 CNAME 값(보통 `cname.vercel-dns.com`)을 Route53에 등록:
   - Route53 → `jaychang99.dev` 호스팅존 → **Create record**: 이름 `ar`, 유형 `CNAME`, 값 `cname.vercel-dns.com`, TTL 300.
   - 몇 분 뒤 Vercel이 인증서를 발급하면 `https://ar.jaychang99.dev`가 열립니다.
5. Lambda의 `WEB_ORIGIN`이 `https://ar.jaychang99.dev`인지 확인하고(아니면 `.env.lambda` 수정 후 `pnpm deploy:api`), Preview 배포도 쓰려면 `WEB_ORIGIN=https://ar.jaychang99.dev,https://<project>.vercel.app`처럼 쉼표로 추가합니다.

## 4b. CI/CD (GitHub Actions)

`.github/workflows/ci.yml`:
- **모든 PR / 푸시**: `pnpm install` → `db:generate` → lint → typecheck → unit 테스트 → API 통합 테스트(MySQL 8.4 서비스 컨테이너) → 웹 프로덕션 빌드.
- **main 푸시**: 위 테스트 통과 후 `deploy-api` 잡이 AWS OIDC로 `recall-studio-github-deploy` 역할을 맡아 `prisma migrate deploy`(TiDB) → `infra/aws/deploy-api.sh`(번들·smoke·Lambda 업데이트) → `/health`가 `db: ok`인지 확인. 웹은 Vercel의 GitHub 연동이 같은 푸시로 따로 배포합니다.
- 설정값: 저장소 **Secrets** `DATABASE_URL`, `API_JWT_SECRET`, `WEB_ORIGIN`; **Variables** `AWS_ROLE_ARN`, `AWS_REGION`. 바꾸려면 `gh secret set <NAME> --body …`.
- AWS 쪽: OIDC 프로바이더 `token.actions.githubusercontent.com` + IAM 역할 `recall-studio-github-deploy` (신뢰: `repo:jaychang99/active-recall:ref:refs/heads/main` 과 `…:environment:production` — 잡이 `environment: production`을 쓰면 OIDC `sub`가 environment 형태가 됨, 권한: `recall-studio-api` 함수의 Get*/UpdateFunctionCode/UpdateFunctionConfiguration/GetFunctionUrlConfig/GetPolicy). 함수·URL·실행 역할을 처음 만드는 것은 로컬 `pnpm deploy:api`(관리자 자격증명) 몫입니다.

## 5. 기존 로컬 데이터 옮기기

1. (업그레이드 전에 받아둔) 백업 JSON — `/settings → 전체 백업 (JSON)` 또는 `GET /exports/backup.json`. v1(단일 사용자 시절)과 v2 백업 모두 복원됩니다.
2. `https://ar.jaychang99.dev` 로그인 → **설정 → 백업 복원** → 파일 선택. 내 계정의 데이터가 통째로 백업 내용으로 교체되고, 모든 id는 새로 발급되며 외래키는 다시 연결됩니다.

## 6. 운영 메모

- **비용 알림**: AWS Billing → Budgets에서 $1 예산 알림을 걸어 두면 프리티어를 넘는 순간 메일이 옵니다. TiDB Starter는 무료 한도(월 5천만 RU)를 넘으면 그 달은 조절(throttle)되고 카드 등록 전까지 과금되지 않습니다.
- **로그**: `aws logs tail /aws/lambda/recall-studio-api --follow --region ap-northeast-1`.
- **마이그레이션 순서**: 스키마 변경 → `db:deploy`(TiDB) → `pnpm deploy:api` → Vercel 배포(푸시). 컬럼 삭제처럼 호환되지 않는 변경은 API를 먼저 올립니다.
- **사용자 삭제**: `/data`는 자기 데이터만 보입니다. 계정 자체를 지우려면 TiDB SQL Editor에서 `DELETE FROM User WHERE email='…'` (CASCADE로 전부 삭제).
- **다른 호스팅으로 옮기기**: API는 `WEB_ORIGIN`, `DATABASE_URL`, `API_JWT_SECRET`만 있으면 어디서든 `node dist/main.js`로 돌고(`API_HOST=0.0.0.0`), 웹은 `NEXT_PUBLIC_API_URL`만 바꾸면 됩니다.

## 로컬 개발

`.env.example`의 값으로 `apps/api/.env`, `apps/web/.env.local`을 채우면 Google 설정 없이 **개발용 로그인**(아무 이메일)으로 들어갑니다. `pnpm db:seed`는 `dev@local` 사용자에게 예제 덱을 넣으므로 그 이메일로 로그인하면 바로 보입니다. e2e(`pnpm test:e2e`)는 `e2e@test.local`로 로그인해 돌아갑니다.
