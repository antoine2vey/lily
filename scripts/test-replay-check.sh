#!/usr/bin/env bash
# Drives scripts/replay-check.sh against a scratch repo whose first commit has
# a mistake and whose second commit fixes it.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/replay-check.sh"
fails=0

expect() { # expect <name> <want> <got>
	if [ "$2" = "$3" ]; then
		echo "ok   $1 (want $2)"
	else
		echo "FAIL $1: want $2, got $3"
		fails=$((fails + 1))
	fi
}

# replay <sha> <command...>: prints the exit code and the last output line.
replay() {
	local sha=$1 out code=0
	shift
	out=$(REPLAY_FILES="check.sh" bash "$SCRIPT" "$sha" -- "$@" 2>&1) || code=$?
	echo "$code $(tail -1 <<<"$out")"
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
git init -q . && git config user.email t@t && git config user.name t
git config gc.auto 0 && git config maintenance.auto false
echo 'tomorrow = today + 86400000' >picker.ts
git add -A && git commit -qm mistake
mistake=$(git rev-parse HEAD)
echo 'tomorrow = addDays(today, 1)' >picker.ts
git add -A && git commit -qm fix
fixed=$(git rev-parse HEAD)
# The check is new, so it exists only in the working tree.
printf '#!/bin/sh\n! grep -q 86400000 picker.ts\n' >check.sh

# The working tree holds the fix, so this fails only if the replay checked out the mistake.
expect "check fails on the mistake" \
	"0 replay: check failed at $mistake as expected" "$(replay "$mistake" sh check.sh)"
expect "check passes on the fix" \
	"1 replay: check passed at $fixed; it does not catch this mistake" "$(replay "$fixed" sh check.sh)"
expect "a command that cannot run is not a failing check" \
	"2 replay: the command could not run at $mistake (exit 127)" "$(replay "$mistake" no-such-command)"
expect "every worktree is removed" 1 "$(git worktree list | wc -l | tr -d ' ')"

[ "$fails" -eq 0 ] || { echo "$fails case(s) failed"; exit 1; }
