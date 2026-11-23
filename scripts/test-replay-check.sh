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

# replay <files> <regex> <sha> <command...>: prints the exit code and the last output line.
replay() {
	local files=$1 regex=$2 sha=$3 out code=0
	shift 3
	out=$(REPLAY_FILES="$files" REPLAY_EXPECT="$regex" bash "$SCRIPT" "$sha" -- "$@" 2>&1) || code=$?
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
# The check and its rule are new, so they exist only in the working tree.
echo 86400000 >rule.txt
cat >check.sh <<'EOF'
rule=$(cat rule.txt) || exit 3
if grep -q "$rule" picker.ts; then echo "day math on an instant"; exit 1; fi
EOF
both="check.sh rule.txt"
hit='day math on an instant'

# The working tree holds the fix, so this fails only if the replay checked out the mistake.
expect "check fails on the mistake" \
	"0 replay: check failed at $mistake as expected" "$(replay "$both" "$hit" "$mistake" sh check.sh)"
expect "check passes on the fix" \
	"1 replay: check passed at $fixed; it does not catch this mistake" "$(replay "$both" "$hit" "$fixed" sh check.sh)"
expect "a missing rule file is not a caught mistake" \
	"2 replay: the command failed at $mistake (exit 3) without printing /$hit/" "$(replay check.sh "$hit" "$mistake" sh check.sh)"
expect "a failure without the expected diagnostic is not a caught mistake" \
	"2 replay: the command failed at $mistake (exit 1) without printing /calendar day/" "$(replay "$both" 'calendar day' "$mistake" sh check.sh)"
expect "a command that cannot run is not a caught mistake" \
	"2 replay: the command failed at $mistake (exit 127) without printing /$hit/" "$(replay "$both" "$hit" "$mistake" no-such-command)"
expect "a killed command is not a caught mistake" \
	"2 replay: the command was killed at $mistake (exit 137)" "$(replay "$both" "$hit" "$mistake" sh -c "echo '$hit'; kill -9 \$\$")"
expect "REPLAY_EXPECT is required" 2 "$(replay "$both" '' "$mistake" sh check.sh | cut -d' ' -f1)"
expect "every worktree is removed" 1 "$(git worktree list | wc -l | tr -d ' ')"

[ "$fails" -eq 0 ] || { echo "$fails case(s) failed"; exit 1; }
