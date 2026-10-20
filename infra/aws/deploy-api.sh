#!/usr/bin/env bash
# Deploys the API to AWS Lambda (Node 22, arm64) behind a public Function URL. Idempotent: creates the IAM role,
# the function and the URL on first run, updates code + environment afterwards. Needs the AWS CLI with
# credentials that may manage IAM roles and Lambda functions.
#
#   infra/aws/.env.lambda   environment for the function (DATABASE_URL, API_JWT_SECRET, WEB_ORIGIN) — gitignored
#   pnpm deploy:api         builds apps/api/lambda-dist/lambda.zip and runs this script
#
# Overridable: AWS_REGION (default ap-northeast-1 — same region as a TiDB Cloud Starter in Tokyo),
#              FUNCTION_NAME (recall-studio-api), MEMORY_MB (1024), TIMEOUT_S (30)
# First run (creates the IAM role, function and URL) needs an admin-ish identity; later runs only need
# lambda:Get*/Update* on the function — that is what the GitHub Actions role has (.github/workflows/ci.yml).
set -euo pipefail
cd "$(dirname "$0")/../.."

REGION="${AWS_REGION:-ap-northeast-1}"
FN="${FUNCTION_NAME:-recall-studio-api}"
ROLE="${ROLE_NAME:-${FN}-role}"
MEMORY="${MEMORY_MB:-1024}"
TIMEOUT="${TIMEOUT_S:-30}"
ENV_FILE="infra/aws/.env.lambda"
ZIP="apps/api/lambda-dist/lambda.zip"

command -v aws >/dev/null || { echo "aws CLI not found (brew install awscli)"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (copy infra/aws/.env.lambda.example)"; exit 1; }

echo "▸ build bundle"
bash apps/api/scripts/build-lambda.sh

# .env.lambda → Lambda "Variables" JSON (NODE_ENV forced to production)
ENV_JSON=$(python3 - "$ENV_FILE" <<'PY'
import json, sys
vars = {"NODE_ENV": "production"}
for line in open(sys.argv[1]):
    line = line.strip()
    if not line or line.startswith('#') or '=' not in line: continue
    k, v = line.split('=', 1)
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'': v = v[1:-1]
    vars[k.strip()] = v
print(json.dumps({"Variables": vars}))
PY
)

echo "▸ lambda $FN ($REGION)"
if aws lambda get-function --function-name "$FN" --region "$REGION" >/dev/null 2>&1; then
  # Update path: only the Lambda permissions the CI role has (no IAM / URL management needed).
  aws lambda update-function-code --function-name "$FN" --region "$REGION" --zip-file "fileb://$ZIP" --architectures arm64 >/dev/null
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
  aws lambda update-function-configuration --function-name "$FN" --region "$REGION" --runtime nodejs24.x --handler index.handler --memory-size "$MEMORY" --timeout "$TIMEOUT" --environment "$ENV_JSON" >/dev/null
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
  echo "   updated"
else
  echo "▸ iam role $ROLE"
  if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
    aws iam create-role --role-name "$ROLE" --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
    aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    echo "   created; waiting for IAM propagation"; sleep 10
  fi
  ROLE_ARN=$(aws iam get-role --role-name "$ROLE" --query Role.Arn --output text)
  aws lambda create-function --function-name "$FN" --region "$REGION" --runtime nodejs24.x --architectures arm64 --handler index.handler --role "$ROLE_ARN" --zip-file "fileb://$ZIP" --memory-size "$MEMORY" --timeout "$TIMEOUT" --environment "$ENV_JSON" >/dev/null
  aws lambda wait function-active --function-name "$FN" --region "$REGION"
  echo "   created"
fi

echo "▸ function url"
if ! aws lambda get-function-url-config --function-name "$FN" --region "$REGION" >/dev/null 2>&1; then
  # First deploy only (needs CreateFunctionUrlConfig / AddPermission, which the CI role deliberately lacks).
  aws lambda create-function-url-config --function-name "$FN" --region "$REGION" --auth-type NONE >/dev/null
  # Since Oct 2025 a public (NONE) URL needs BOTH statements: InvokeFunctionUrl and InvokeFunction-via-URL.
  aws lambda add-permission --function-name "$FN" --region "$REGION" --statement-id public-url --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE >/dev/null
  aws lambda add-permission --function-name "$FN" --region "$REGION" --statement-id public-url-invoke --action lambda:InvokeFunction --principal '*' --invoked-via-function-url >/dev/null
fi
URL=$(aws lambda get-function-url-config --function-name "$FN" --region "$REGION" --query FunctionUrl --output text)
echo
echo "API URL: $URL"
echo "  health: curl ${URL}health"
echo "  → set NEXT_PUBLIC_API_URL=${URL%/} in Vercel (no trailing slash)"
