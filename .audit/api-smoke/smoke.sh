#!/usr/bin/env bash
# Boot smoke test for @lily/api on Effect v4, against PRIVATE throwaway
# services only: a fresh Postgres cluster on 127.0.0.1:55437 and a Redis
# container on 127.0.0.1:56380. It never touches lily-postgres (5432),
# lily-redis (6379) or any remote service. External providers stay inert:
# blog/tips generation off, OTel off, no Discord/APNs/RevenueCat/OpenAI keys,
# a placeholder Resend key that no request path reaches on an empty DB.
#
# Usage (from the repo root):
#   .audit/api-smoke/smoke.sh
# Optional env:
#   SMOKE_DIR        scratch dir for the cluster (default: $TMPDIR/lily-api-smoke)
#   PGVECTOR_PREFIX  DESTDIR of a pgvector build (`make DESTDIR=... install`);
#                    without it the knowledge DB gets no schema and the
#                    knowledge-ingestion worker logs a missing-table error
#   SMOKE_SECONDS    how long to let schedulers run (default: 75)
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel)
OUT="$ROOT/.audit/api-smoke"
SMOKE_DIR=${SMOKE_DIR:-${TMPDIR:-/tmp}/lily-api-smoke}
SMOKE_SECONDS=${SMOKE_SECONDS:-75}
PG_BIN=$(dirname "$(command -v pg_ctl)")
PG_PORT=55437
REDIS_PORT=56380
REDIS_NAME=lily-api-smoke-redis
API=http://127.0.0.1:3000

fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  fail "port 3000 is already in use (the API port is fixed in src/index.ts)"
fi

mkdir -p "$SMOKE_DIR"
PGDATA="$SMOKE_DIR/pg"
if [ ! -d "$PGDATA" ]; then
  "$PG_BIN/initdb" -D "$PGDATA" -U postgres -A trust >"$SMOKE_DIR/initdb.log" 2>&1 \
    || fail "initdb, see $SMOKE_DIR/initdb.log"
fi

PG_OPTS="-p $PG_PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories= -c log_statement=all -c log_line_prefix='%m [%d] '"
if [ -n "${PGVECTOR_PREFIX:-}" ]; then
  SHARE=$("$PG_BIN/pg_config" --sharedir)
  PKGLIB=$("$PG_BIN/pg_config" --pkglibdir)
  EXT_DIR="$PGVECTOR_PREFIX$SHARE"
  # extension_control_path needs module_pathname without the $libdir prefix
  sed -i.bak "s#\\\$libdir/vector#vector#" "$EXT_DIR/extension/vector.control"
  # pg_ctl hands -o to a shell, so the $system/$libdir macros need quoting
  PG_OPTS="$PG_OPTS -c 'extension_control_path=$EXT_DIR:\$system' -c 'dynamic_library_path=$PGVECTOR_PREFIX$PKGLIB:\$libdir'"
fi
"$PG_BIN/pg_ctl" -D "$PGDATA" -l "$SMOKE_DIR/pg.log" -o "$PG_OPTS" -w start >/dev/null \
  || fail "postgres start, see $SMOKE_DIR/pg.log"

docker run -d --rm --name "$REDIS_NAME" -p "127.0.0.1:$REDIS_PORT:6379" redis:7-alpine >/dev/null \
  || fail "redis container"

cleanup() {
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null && wait "$API_PID" 2>/dev/null
  docker rm -f "$REDIS_NAME" >/dev/null 2>&1
  "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1
}
trap cleanup EXIT

PSQL="$PG_BIN/psql -h 127.0.0.1 -p $PG_PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c 'drop database if exists lily' -c 'drop database if exists lily_knowledge' \
  -c 'create database lily' -c 'create database lily_knowledge' || fail "create databases"

export DATABASE_URL=postgresql://postgres@127.0.0.1:$PG_PORT/lily
export KNOWLEDGE_DATABASE_URL=postgresql://postgres@127.0.0.1:$PG_PORT/lily_knowledge
{
  bun run --cwd packages/db db:migrate:prod &&
    bun run --cwd packages/db db:seed:prod
} >"$OUT/schema.txt" 2>&1 || fail "main schema, see $OUT/schema.txt"
if [ -n "${PGVECTOR_PREFIX:-}" ]; then
  bun run --cwd packages/knowledge-db db:migrate:prod >>"$OUT/schema.txt" 2>&1 \
    || fail "knowledge schema, see $OUT/schema.txt"
fi

PG_LOG_START=$(wc -l <"$SMOKE_DIR/pg.log")

# GCSService parses this at layer build; token_uri points at a closed local
# port so nothing can authenticate against Google.
GCS_PLACEHOLDER='{"type":"service_account","project_id":"smoke-project","private_key_id":"x","private_key":"x","client_email":"smoke@example.invalid","client_id":"x","auth_uri":"http://127.0.0.1:9/auth","token_uri":"http://127.0.0.1:9/token","auth_provider_x509_cert_url":"http://127.0.0.1:9/certs","client_x509_cert_url":"http://127.0.0.1:9/cert"}'

# Production log mode (JSON, lowercase level), with every outbound provider inert.
env -i HOME="$HOME" PATH="$PATH" \
  NODE_ENV=production \
  DATABASE_URL="$DATABASE_URL" \
  KNOWLEDGE_DATABASE_URL="$KNOWLEDGE_DATABASE_URL" \
  REDIS_URL=redis://127.0.0.1:$REDIS_PORT \
  JWT_SECRET=smoke-jwt-secret-smoke-jwt-secret-0000 \
  JWT_ISSUER=lily \
  SERVICE_TOKEN_SECRET=smoke-service-secret \
  RESEND_API_KEY=re_smoke_placeholder \
  EMAIL_FROM_ADDRESS=smoke@example.invalid \
  GCP_PROJECT_ID=smoke-project \
  GCS_CREDENTIALS_JSON="$GCS_PLACEHOLDER" \
  GCS_PLANT_BUCKET=smoke-plant-bucket \
  GCS_AI_BUCKET=smoke-ai-bucket \
  REVENUECAT_API_KEY=smoke-placeholder \
  REVENUECAT_WEBHOOK_AUTH_KEY=smoke-placeholder \
  OPENWEATHERMAP_API_KEY=smoke-placeholder \
  APPLE_BUNDLE_ID=com.lilyapp.app \
  GOOGLE_OAUTH_WEB_CLIENT_ID=smoke-placeholder \
  GOOGLE_OAUTH_IOS_CLIENT_ID=smoke-placeholder \
  GOOGLE_OAUTH_ANDROID_CLIENT_ID=smoke-placeholder \
  JWT_ACCESS_TOKEN_EXPIRY='15 minutes' \
  DISABLE_MAGIC_LINK_VERIFICATION=false \
  OTEL_ENABLED=false \
  BLOG_GENERATION_ENABLED=false \
  TIPS_GENERATION_ENABLED=false \
  ALERT_ENVIRONMENT_NAME=smoke \
  bun --cwd packages/api src/index.ts >"$OUT/api-log.txt" 2>&1 &
API_PID=$!

for _ in $(seq 1 120); do
  curl -s -o /dev/null "$API/health" && break
  kill -0 "$API_PID" 2>/dev/null || fail "API exited during boot, see $OUT/api-log.txt"
  sleep 0.5
done
LISTENER=$(lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null | head -1)
[ "$LISTENER" = "$API_PID" ] || fail "port 3000 is held by pid $LISTENER, not the smoke API ($API_PID)"

probe() { # name, expected status, curl args...
  local name=$1 want=$2
  shift 2
  local body status
  body=$(curl -s -w '\n%{http_code}' "$@")
  status=${body##*$'\n'}
  body=${body%$'\n'*}
  printf '### %s\n$ curl %s\nstatus: %s (expected %s)\n%s\n\n' "$name" "$*" "$status" "$want" "$(printf '%s' "$body" | head -c 400)"
  [ "$status" = "$want" ] || echo "MISMATCH $name" >&2
}

{
  probe health 200 "$API/health"
  probe 'openapi.json' 200 -o "$SMOKE_DIR/openapi.json" "$API/openapi.json"
  printf 'openapi.json: %s\n\n' "$(bun -e "const s=JSON.parse(await Bun.file('$SMOKE_DIR/openapi.json').text()); console.log('valid JSON, openapi', s.openapi, '-', Object.keys(s.paths).length, 'paths')")"
  probe 'auth route without token' 401 "$API/api/auth/me"
  probe 'plants without token' 401 "$API/api/plants"
  probe 'validation failure (empty verify payload)' 400 -X POST -H 'content-type: application/json' -d '{}' "$API/api/auth/verify"
  probe 'unknown route' 404 "$API/definitely-not-a-route"
} >"$OUT/curl.txt" 2>"$OUT/curl.mismatch"

# Event-bus subscribers (achievement checker, Live Activity) only touch the
# DB when an event arrives, so publish one each for a user that does not exist.
SMOKE_USER=00000000-0000-4000-8000-00000000beef
docker exec "$REDIS_NAME" redis-cli PUBLISH lily:events \
  "{\"_tag\":\"PlantShared\",\"userId\":\"$SMOKE_USER\",\"plantId\":\"$SMOKE_USER\"}" >"$OUT/redis.txt"
docker exec "$REDIS_NAME" redis-cli PUBLISH lily:events \
  "{\"_tag\":\"PlantLifecycleChanged\",\"userId\":\"$SMOKE_USER\",\"plantId\":\"$SMOKE_USER\"}" >>"$OUT/redis.txt"

sleep "$SMOKE_SECONDS"
kill -0 "$API_PID" 2>/dev/null || fail "API died while schedulers ran, see $OUT/api-log.txt"
docker exec "$REDIS_NAME" redis-cli CLIENT LIST | tr ' ' '\n' | grep '^cmd=' | sort | uniq -c >>"$OUT/redis.txt"
# Every statement the API sent while it ran; scheduler ticks show up as
# periodic queries even when an empty DB gives their tasks nothing to log.
tail -n +"$((PG_LOG_START + 1))" "$SMOKE_DIR/pg.log" | grep -E 'LOG:  (execute|statement)' >"$OUT/pg-statements.txt"

cat "$OUT/curl.txt"
if [ -s "$OUT/curl.mismatch" ]; then cat "$OUT/curl.mismatch"; fail "status mismatch"; fi
rm -f "$OUT/curl.mismatch"
echo "log lines: $(wc -l <"$OUT/api-log.txt")"
echo "levels: $(grep -o '"level":"[a-zA-Z]*"' "$OUT/api-log.txt" | sort | uniq -c | tr '\n' ' ')"
echo "pg statements from the API: $(wc -l <"$OUT/pg-statements.txt")"
echo "statements per second (startup ticks, then the 30s ingestion worker and 1min notification scheduler):"
awk '{print substr($2, 1, 8)}' "$OUT/pg-statements.txt" | uniq -c
echo "error-level log lines: $(grep -c '"level":"error"' "$OUT/api-log.txt")"
echo "SMOKE OK"
