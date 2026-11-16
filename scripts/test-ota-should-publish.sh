#!/usr/bin/env bash
# Drives scripts/ota-should-publish.sh and the pre-fix github.event.before
# logic against scratch repos. Usage: test-ota-should-publish.sh [new|legacy]
set -euo pipefail

MODE="${1:-new}"
SCRIPT="$(cd "$(dirname "$0")" && pwd)/ota-should-publish.sh"
fails=0

legacy() {
	# The decision block as it stood in ota-update.yml before the fix.
	local before="$1" after="$2" range
	if [ -z "$before" ] || [ "$before" = "0000000000000000000000000000000000000000" ] \
		|| ! git cat-file -e "${before}^{commit}" 2>/dev/null; then
		range="HEAD^1 HEAD"
	else
		range="$before $after"
	fi
	if git diff --name-only $range | grep -E '^packages/(app|shared)/' \
		| grep -vE '^packages/app/(eas|app)\.json$' | grep -vE '\.md$' | grep -q .; then
		echo true
	else
		echo false
	fi
}

# decide <event> <before> <after>: prints true|false under the selected mode.
decide() {
	if [ "$MODE" = legacy ]; then
		if [ "$1" = workflow_dispatch ]; then echo true; else legacy "$2" "$3"; fi
	else
		# The workflow appends stdout to $GITHUB_OUTPUT, and the runner fails
		# the step on any line there that is not key=value.
		local out bad
		out=$(EVENT_NAME="$1" AFTER_SHA="$3" bash "$SCRIPT" 2>/dev/null)
		if bad=$(grep -vE '^[A-Za-z_][A-Za-z0-9_-]*=' <<<"$out"); then
			echo "not key=value on stdout: $bad"
		else
			sed -n 's/^result=//p' <<<"$out"
		fi
	fi
}

commit() { # commit <file> <content>
	mkdir -p "$(dirname "$1")"
	echo "$2" >"$1"
	git add -A
	git commit -qm "touch $1"
	git rev-parse HEAD
}

expect() { # expect <name> <want> <got>
	if [ "$2" = "$3" ]; then
		echo "ok   $1 (want $2)"
	else
		echo "FAIL $1: want $2, got $3"
		fails=$((fails + 1))
	fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
git init -q . && git config user.email t@t && git config user.name t
base=$(commit README.txt base)
git update-ref refs/ota/production "$base"

# 1. normal push with an app change
a=$(commit packages/app/src/a.ts 1)
expect "normal push, app change" true "$(decide push "$base" "$a")"

# 2. push with no app change (api only), published state is current
git update-ref refs/ota/production "$a"
b=$(commit packages/api/src/b.ts 1)
expect "push, no app change" false "$(decide push "$a" "$b")"

# 3. dropped pending run: C1 touches app (run dropped, ref stays at b),
#    C2 touches only app.json (a paths-filter misfire) and its run survives.
c1=$(commit packages/app/src/c1.ts 1)
c2=$(commit packages/app/app.json '{"v":2}')
expect "dropped run's app change, later push has none" true "$(decide push "$c1" "$c2")"

# 4. first run, no last-published record
git update-ref -d refs/ota/production
d=$(commit packages/api/src/d.ts 1)
expect "first run, no record, no app change in push" true "$(decide push "$c2" "$d")"

# 5. failed previous publish: ref never moved past c2, c3 is app-free
git update-ref refs/ota/production "$c2"
e1=$(commit packages/shared/src/e1.ts 1)
e2=$(commit packages/api/src/e2.ts 1)
expect "failed previous publish of e1, next push app-free" true "$(decide push "$e1" "$e2")"

# 6. record points at a commit that is not an ancestor (history rewrite)
git update-ref refs/ota/production "$(git commit-tree -m orphan "$(git rev-parse HEAD^{tree})")"
expect "non-ancestor record fails open" true "$(decide push "$e1" "$e2")"

# 7. manual dispatch always publishes
git update-ref refs/ota/production "$e2"
expect "workflow_dispatch" true "$(decide workflow_dispatch "$e2" "$e2")"

# 8. a commit touching 2000 app files: the changed-file list is far larger
#    than a pipe buffer, which a `git diff | grep -q` decision reads as SIGPIPE.
git update-ref refs/ota/production "$e2"
mkdir -p packages/app/src/big
for i in $(seq 1 2000); do echo "$i" >"packages/app/src/big/File$i.tsx"; done
git add -A && git commit -qm "touch 2000 app files"
big=$(git rev-parse HEAD)
for run in 1 2 3 4 5; do
	expect "2000 app files changed (run $run)" true "$(decide push "$e2" "$big")"
done

# 9. re-run of an old run after a newer commit was published: the record is
#    ahead of the commit under test.
git update-ref refs/ota/production "$big"
expect "re-run of an older push" false "$(decide push "$e1" "$e2")"
expect "re-run of an older dispatch" false "$(decide workflow_dispatch "$e2" "$e2")"

if [ "$MODE" = new ]; then
	# 10. the record the workflow leases the ref update on
	expect "last= names the record" "$big" \
		"$(EVENT_NAME=push AFTER_SHA="$big" bash "$SCRIPT" 2>/dev/null | sed -n 's/^last=//p')"

	# 11. git diff itself failing must publish, not skip
	git update-ref refs/ota/production "$e2"
	real_git="$(command -v git)"
	mkdir "$work/bin"
	printf '#!/bin/sh\n[ "$1" = diff ] && exit 129\nexec "%s" "$@"\n' "$real_git" >"$work/bin/git"
	chmod +x "$work/bin/git"
	expect "git diff error fails open" true "$(PATH="$work/bin:$PATH" decide push "$e1" "$e2")"
fi

[ "$fails" -eq 0 ] || { echo "$fails case(s) failed"; exit 1; }
