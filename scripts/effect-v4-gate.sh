#!/usr/bin/env bash
# Gate for the Effect v3 -> v4 migration. Run from the repo root.
# Usage: scripts/effect-v4-gate.sh [--fast]   (--fast skips lint and tests)
set -uo pipefail

LOG_DIR=${GATE_LOG_DIR:-.audit/gate}
mkdir -p "$LOG_DIR"
fail=0
check() { printf '%-44s %s\n' "$1" "$2"; [ "$2" = ok ] || fail=1; }

stale=$(grep -oE '"(effect@3\.[^"]*|@effect/(platform|sql|sql-drizzle|rpc|ai|cluster|workflow|experimental)@[^"]*)"' bun.lock | sort -u)
check 'bun.lock has no v3-only effect packages' "$([ -z "$stale" ] && echo ok || echo "FAIL: $(echo $stale | tr '\n' ' ')")"

v3_imports=$(git grep -lE "from '@effect/(platform|sql|sql-drizzle|rpc|ai|cluster|workflow|experimental)(/[A-Za-z]+)?'" -- 'packages/**/*.ts' 'packages/**/*.tsx' | wc -l | tr -d ' ')
check 'no imports of v3-only @effect packages' "$([ "$v3_imports" = 0 ] && echo ok || echo "FAIL: $v3_imports files")"

bun scripts/effect-v4-dateparts-check.ts >"$LOG_DIR/dateparts.log" 2>&1
check 'no v3 DateTime parts keys (tsc-invisible)' "$([ $? = 0 ] && echo ok || echo "FAIL: $(tail -1 "$LOG_DIR/dateparts.log")")"

# stale incremental state kept reporting a deleted effect@3 copy as a duplicate
find packages -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete
bun run tsc --force --continue >"$LOG_DIR/tsc.log" 2>&1
check 'bun run tsc' "$([ $? = 0 ] && echo ok || echo "FAIL: $(grep -cE 'error TS' "$LOG_DIR/tsc.log") errors, see $LOG_DIR/tsc.log")"

if [ "${1:-}" != --fast ]; then
  bun run lint >"$LOG_DIR/lint.log" 2>&1
  check 'bun run lint' "$([ $? = 0 ] && echo ok || echo "FAIL: see $LOG_DIR/lint.log")"

  bun run test --force --continue >"$LOG_DIR/test.log" 2>&1
  test_exit=$?
  check 'bun run test exits 0' "$([ $test_exit = 0 ] && echo ok || echo "FAIL: see $LOG_DIR/test.log")"

  # v3 baseline, measured on main @ 5c339b82
  for pair in api:1568 app:909 shared:364 mcp:53; do
    pkg=${pair%%:*}; min=${pair##*:}
    n=$(grep -E "@lily/$pkg:test:.*(Tests +[0-9]+ passed|Tests: +[0-9]+ passed)" "$LOG_DIR/test.log" | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+')
    check "@lily/$pkg passing tests >= $min" "$([ -n "$n" ] && [ "$n" -ge "$min" ] && echo ok || echo "FAIL: ${n:-none}")"
  done
fi

exit $fail
