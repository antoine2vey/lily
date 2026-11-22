#!/usr/bin/env bash
# Usage: REPLAY_FILES="path ..." [REPLAY_INSTALL=1] scripts/replay-check.sh <sha> -- <command...>
# Runs <command> in a throwaway worktree at <sha>, with REPLAY_FILES copied in
# from this tree, and succeeds only when the command fails there. A new check is
# trusted once it fails on the past mistake it guards against. The command sees
# this tree's root as $REPLAY_ROOT, so it can use its tools without an install.
set -euo pipefail

if [ $# -lt 3 ] || [ "$2" != -- ]; then
	echo 'usage: REPLAY_FILES="path ..." scripts/replay-check.sh <sha> -- <command...>' >&2
	exit 2
fi
sha=$1
shift 2
root=$(git rev-parse --show-toplevel)
dir=$(mktemp -d "${TMPDIR:-/tmp}/replay.XXXXXX")
trap 'git -C "$root" worktree remove --force "$dir" 2>/dev/null || rm -rf "$dir"; git -C "$root" worktree prune' EXIT
git -C "$root" worktree add --quiet --detach "$dir" "$sha"

read -ra files <<<"${REPLAY_FILES:-}"
for f in ${files[@]+"${files[@]}"}; do
	mkdir -p "$dir/$(dirname "$f")"
	cp "$root/$f" "$dir/$f"
done
if [ "${REPLAY_INSTALL:-0}" = 1 ]; then
	(cd "$dir" && bun install --frozen-lockfile)
fi

status=0
(cd "$dir" && REPLAY_ROOT=$root "$@") || status=$?
if [ "$status" -eq 126 ] || [ "$status" -eq 127 ]; then
	echo "replay: the command could not run at $sha (exit $status)" >&2
	exit 2
fi
if [ "$status" -eq 0 ]; then
	echo "replay: check passed at $sha; it does not catch this mistake"
	exit 1
fi
echo "replay: check failed at $sha as expected"
