#!/usr/bin/env bash
# Usage: REPLAY_EXPECT=<regex> REPLAY_FILES="path ..." [REPLAY_INSTALL=1] \
#   scripts/replay-check.sh <sha> -- <command...>
# Runs <command> in a throwaway worktree at <sha>, with REPLAY_FILES copied in
# from this tree. It succeeds only when the command fails there and its combined
# output matches REPLAY_EXPECT, the diagnostic the check prints for the mistake.
# Any other failure, such as a missing rule file or a missing target, means the
# check never ran, so it exits 2. The command sees this tree's root as
# $REPLAY_ROOT, so it can use its tools without an install.
# REPLAY_EXPECT must match the diagnostic message, never the rule or file name,
# which a missing rule file also prints. The command must target the file that
# held the mistake.
set -euo pipefail

if [ $# -lt 3 ] || [ "$2" != -- ] || [ -z "${REPLAY_EXPECT:-}" ]; then
	echo 'usage: REPLAY_EXPECT=<regex> REPLAY_FILES="path ..." scripts/replay-check.sh <sha> -- <command...>' >&2
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
out=$(cd "$dir" && REPLAY_ROOT=$root "$@" 2>&1) || status=$?
printf '%s\n' "$out"
if [ "$status" -eq 0 ]; then
	echo "replay: check passed at $sha; it does not catch this mistake"
	exit 1
fi
if [ "$status" -gt 128 ]; then
	echo "replay: the command exited $status at $sha (signal or crash)" >&2
	exit 2
fi
if ! grep -qE -- "$REPLAY_EXPECT" <<<"$out"; then
	echo "replay: the command failed at $sha (exit $status) without printing /$REPLAY_EXPECT/" >&2
	exit 2
fi
echo "replay: check failed at $sha as expected"
