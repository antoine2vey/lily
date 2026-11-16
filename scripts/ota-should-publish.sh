#!/usr/bin/env bash
# Decides whether the OTA workflow must publish the checked-out commit.
#
# The range starts at the last commit published to the branch (the ref
# refs/ota/production, moved by the workflow after each successful publish),
# not at github.event.before. A run dropped by the concurrency group, or one
# that failed, never moves the ref, so its app change stays inside the next
# run's range.
#
# Env: EVENT_NAME, AFTER_SHA (default HEAD), PUBLISHED_REF (default
# refs/ota/production).
# Stdout is appended to $GITHUB_OUTPUT, so it carries key=value lines only:
# result=true|false and last=<last published commit, empty when unknown>.
# Notices go to stderr.
# Fails open: any doubt about the last published commit means publish. The one
# exception is a commit older than the published one, which never publishes.
set -euo pipefail

EVENT_NAME="${EVENT_NAME:-push}"
AFTER_SHA="${AFTER_SHA:-HEAD}"
PUBLISHED_REF="${PUBLISHED_REF:-refs/ota/production}"
LAST=""

decide() { # decide <true|false> <notice>
	echo "result=$1"
	echo "last=${LAST}"
	echo "::notice::$2" >&2
	exit 0
}

if ! LAST=$(git rev-parse --verify --quiet "${PUBLISHED_REF}^{commit}"); then
	LAST=""
	decide true "No last-published record at ${PUBLISHED_REF}; publishing."
fi

# A re-run of an old run checks out its old commit. Publishing it would put
# old code on top of the newer update.
if AFTER=$(git rev-parse --verify --quiet "${AFTER_SHA}^{commit}") \
	&& [ "$AFTER" != "$LAST" ] \
	&& git merge-base --is-ancestor "$AFTER" "$LAST" 2>/dev/null; then
	decide false "A newer commit ${LAST} is already published; skipping ${AFTER}."
fi

if [ "$EVENT_NAME" = "workflow_dispatch" ]; then
	decide true "Manual dispatch: publishing OTA from current HEAD."
fi

if ! git merge-base --is-ancestor "$LAST" "$AFTER_SHA" 2>/dev/null; then
	decide true "Last published commit ${LAST} is not an ancestor of ${AFTER_SHA}; publishing."
fi

# Defense in depth: the YAML paths filter has misfired before (run
# 26509635618 published an OTA for a blog-only diff), so confirm with a diff.
# Read the exit code, never a pipe: `git diff | grep -q` under pipefail turns
# git's SIGPIPE on a long file list into "no change".
changed=0
git diff --quiet "$LAST" "$AFTER_SHA" -- \
	packages/app packages/shared \
	':(exclude)packages/app/eas.json' \
	':(exclude)packages/app/app.json' \
	':(exclude)*.md' || changed=$?

case "$changed" in
	0) decide false "No packages/app or packages/shared changes since last published ${LAST}; skipping EAS publish." ;;
	1) decide true "App or shared changed since ${LAST}; publishing." ;;
	*) decide true "git diff failed with exit ${changed}; publishing." ;;
esac
