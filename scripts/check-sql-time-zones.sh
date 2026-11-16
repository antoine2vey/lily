#!/usr/bin/env bash
# Fails when code hands Postgres a time zone other than UTC: an AT TIME ZONE
# whose zone is not the literal 'UTC', or a read of pg_timezone_names. Bun owns
# the zone rules, so Postgres must never apply a stored zone. Migrations that
# already ran (packages/db/drizzle/) are exempt, and so is check-time-zones.ts,
# which asks Postgres to accept each canonical zone name on purpose.
set -euo pipefail

cd "$(dirname "$0")/.."

if git grep --untracked -nIiP "AT\s+TIME\s+ZONE(?!\s+'UTC')|pg_timezone_names" -- \
	':(exclude)*.md' \
	':(exclude)*.mdx' \
	':(exclude)packages/db/drizzle/' \
	':(exclude)packages/db/scripts/check-time-zones.ts' \
	':(exclude)scripts/check-sql-time-zones.sh'; then
	echo "Compute local days with the date helpers of @lily/shared and bind the instant, as packages/api/CLAUDE.md describes. Postgres may only apply AT TIME ZONE 'UTC'." >&2
	exit 1
fi
