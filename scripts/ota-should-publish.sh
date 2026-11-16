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
# refs/ota/production). Prints result=true|false and a notice to stdout.
# Fails open: any doubt about the last published commit means publish.
set -euo pipefail

EVENT_NAME="${EVENT_NAME:-push}"
AFTER_SHA="${AFTER_SHA:-HEAD}"
PUBLISHED_REF="${PUBLISHED_REF:-refs/ota/production}"

publish() {
	echo "result=true"
	echo "::notice::$1"
	exit 0
}

if [ "$EVENT_NAME" = "workflow_dispatch" ]; then
	publish "Manual dispatch: publishing OTA from current HEAD."
fi

if ! LAST=$(git rev-parse --verify --quiet "${PUBLISHED_REF}^{commit}"); then
	publish "No last-published record at ${PUBLISHED_REF}; publishing."
fi

if ! git merge-base --is-ancestor "$LAST" "$AFTER_SHA" 2>/dev/null; then
	publish "Last published commit ${LAST} is not an ancestor of ${AFTER_SHA}; publishing."
fi

# Defense in depth: the YAML paths filter has misfired before (run
# 26509635618 published an OTA for a blog-only diff), so confirm with a diff.
if git diff --name-only "$LAST" "$AFTER_SHA" \
	| grep -E '^packages/(app|shared)/' \
	| grep -vE '^packages/app/(eas|app)\.json$' \
	| grep -vE '\.md$' \
	| grep -q .; then
	publish "App or shared changed since ${LAST}; publishing."
fi

echo "result=false"
echo "::notice::No packages/app or packages/shared changes since last published ${LAST}; skipping EAS publish."
