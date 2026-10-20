#!/usr/bin/env bash
# Second half of the deployment, run once the browser-side handoff (infra/handoff/HANDOFF.md) reports DATABASE_URL:
#   DATABASE_URL='mysql://…/recall_studio?sslaccept=strict' bash infra/aws/finish-deploy.sh
# 1. applies the Prisma migrations to TiDB, 2. writes the real DATABASE_URL into infra/aws/.env.lambda,
# 3. redeploys the Lambda, 4. checks /health over the public URL.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -n "${DATABASE_URL:-}" ] || { echo "DATABASE_URL is required"; exit 1; }
case "$DATABASE_URL" in *sslaccept=strict*) ;; *) echo "warning: TiDB Starter needs ?sslaccept=strict in DATABASE_URL";; esac

echo "▸ prisma migrate deploy → TiDB"
(cd apps/api && DATABASE_URL="$DATABASE_URL" pnpm exec prisma migrate deploy)

echo "▸ infra/aws/.env.lambda"
python3 - "$DATABASE_URL" <<'PY'
import re, sys
p = 'infra/aws/.env.lambda'
s = open(p).read()
s = re.sub(r'^DATABASE_URL=.*$', 'DATABASE_URL="%s"' % sys.argv[1], s, flags=re.M)
open(p, 'w').write(s)
PY

echo "▸ deploy"
AWS_REGION="${AWS_REGION:-ap-northeast-1}" bash infra/aws/deploy-api.sh | tail -4
URL=$(aws lambda get-function-url-config --function-name "${FUNCTION_NAME:-recall-studio-api}" --region "${AWS_REGION:-ap-northeast-1}" --query FunctionUrl --output text)
echo "▸ health"
curl -s -m 60 "${URL}health"; echo
