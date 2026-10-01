#!/usr/bin/env bash
# Usage: smoke.sh <base-url> <out-dir>
# Sends the MCP smoke requests and writes one raw transcript per request.
#
# Setup used for v3-baseline/ and v4/: a private Postgres with the drizzle
# schema pushed and seed.sql applied, stub-api.ts on 3199, and the server
# booted with DATABASE_URL, API_BASE_URL=http://127.0.0.1:3199,
# SERVICE_TOKEN_SECRET, MCP_PORT and MCP_SERVER_URL set, via
# `bun run --cwd packages/mcp src/index.ts`. compare.ts diffs the two runs.
set -u
BASE=$1
OUT=$2
mkdir -p "$OUT"
AUTH='Authorization: Bearer smoke-token'
CT='Content-Type: application/json'
ACCEPT='Accept: application/json, text/event-stream'
PV='MCP-Protocol-Version: 2025-06-18'

send() {
  local name=$1 method=$2 body=$3
  shift 3
  local headers=()
  for h in "$@"; do
    if [ -n "$h" ]; then headers+=(-H "$h"); fi
  done
  {
    echo "### request: $method $BASE/mcp"
    for h in "$@"; do
      if [ -n "$h" ]; then echo "$h"; fi
    done
    if [ -n "$body" ]; then echo; echo "$body"; fi
    echo
    echo "### response"
    if [ -n "$body" ]; then
      curl -sS -i -X "$method" "$BASE/mcp" "${headers[@]}" --data "$body" --max-time 15
    else
      curl -sS -i -X "$method" "$BASE/mcp" "${headers[@]}" --max-time 15
    fi
    echo
  } >"$OUT/$name.txt" 2>&1
}

send 01-initialize-string-id POST \
  '{"jsonrpc":"2.0","id":"init_1","method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}' \
  "$AUTH" "$CT" "$ACCEPT"

# A stateful server returns a session id on initialize; later requests echo it.
SID=$(grep -i '^mcp-session-id:' "$OUT/01-initialize-string-id.txt" | tr -d '\r' | cut -d' ' -f2)
S=${SID:+Mcp-Session-Id: $SID}

send 01b-initialize-newer-protocol POST \
  '{"jsonrpc":"2.0","id":"init_2","method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}' \
  "$AUTH" "$CT" "$ACCEPT"
send 02-initialized-notification POST \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  "$AUTH" "$CT" "$ACCEPT" "$PV" "$S"
send 03-batch-of-one POST \
  '[{"jsonrpc":"2.0","id":"batch_1","method":"ping"}]' \
  "$AUTH" "$CT" "$ACCEPT" "$PV" "$S"
send 03b-batch-of-one-tools-list POST \
  '[{"jsonrpc":"2.0","id":"batch_2","method":"tools/list"}]' \
  "$AUTH" "$CT" "$ACCEPT" "$PV" "$S"
send 03c-batch-of-two POST \
  '[{"jsonrpc":"2.0","id":"batch_3","method":"ping"},{"jsonrpc":"2.0","id":"batch_4","method":"ping"}]' \
  "$AUTH" "$CT" "$ACCEPT" "$PV" "$S"
send 04-tools-list POST \
  '{"jsonrpc":"2.0","id":"list_1","method":"tools/list"}' \
  "$AUTH" "$CT" "$ACCEPT" "$PV" "$S"
send 05-tools-call-list-plants POST \
  '{"jsonrpc":"2.0","id":"call_1","method":"tools/call","params":{"name":"list_plants","arguments":{}}}' \
  "$AUTH" "$CT" "$ACCEPT" "$PV" "$S"
send 06-tools-call-ask-plant-question POST \
  '{"jsonrpc":"2.0","id":"call_2","method":"tools/call","params":{"name":"ask_plant_question","arguments":{"question":"How often?"}}}' \
  "$AUTH" "$CT" "$ACCEPT" "$PV" "$S"
send 07-get-mcp-with-bearer GET '' "$AUTH" "$ACCEPT" "$S"
send 08-get-mcp-without-bearer GET '' "$ACCEPT"
send 09-post-mcp-without-bearer POST \
  '{"jsonrpc":"2.0","id":1,"method":"ping"}' "$CT" "$ACCEPT"
send 10-options-preflight OPTIONS '' \
  'Origin: https://chatgpt.com' 'Access-Control-Request-Method: POST'
send 11-numeric-id POST \
  '{"jsonrpc":"2.0","id":7,"method":"ping"}' "$AUTH" "$CT" "$ACCEPT" "$PV" "$S"
send 11b-tools-call-invalid-args POST \
  '{"jsonrpc":"2.0","id":"call_3","method":"tools/call","params":{"name":"get_plant_details","arguments":{}}}' \
  "$AUTH" "$CT" "$ACCEPT" "$PV" "$S"
send 11c-tools-call-unknown-token POST \
  '{"jsonrpc":"2.0","id":"call_4","method":"tools/call","params":{"name":"list_plants","arguments":{}}}' \
  'Authorization: Bearer not-a-real-token' "$CT" "$ACCEPT" "$PV" "$S"
send 12-stale-session-id POST \
  '{"jsonrpc":"2.0","id":"stale_1","method":"tools/list"}' \
  "$AUTH" "$CT" "$ACCEPT" "$PV" 'Mcp-Session-Id: 00000000-0000-0000-0000-000000000000'
send 13-origin-not-allowed POST \
  '{"jsonrpc":"2.0","id":"origin_1","method":"ping"}' \
  "$AUTH" "$CT" "$ACCEPT" "$PV" "$S" 'Origin: https://evil.example'
send 14-accept-json-only POST \
  '{"jsonrpc":"2.0","id":"accept_1","method":"ping"}' \
  "$AUTH" "$CT" 'Accept: application/json' "$PV" "$S"
