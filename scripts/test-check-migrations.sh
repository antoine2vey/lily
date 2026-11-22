#!/usr/bin/env bash
# Runs scripts/check-migrations.sh against scratch repos, one per case.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/check-migrations.sh"
DB=packages/db/drizzle
KNOWLEDGE=packages/knowledge-db/drizzle
GUARD="SET LOCAL lock_timeout = '5s';
--> statement-breakpoint"
fails=0

scratch() {
	local dir
	dir=$(mktemp -d)
	mkdir -p "$dir/scripts" "$dir/$DB" "$dir/$KNOWLEDGE"
	cp "$SCRIPT" "$dir/scripts/"
	git -C "$dir" init -q
	echo "$dir"
}

expect() { # expect <name> <pass|fail> <dir> [stderr substring]
	local out status=pass
	out=$(bash "$3/scripts/check-migrations.sh" 2>&1) || status=fail
	if [ "$status" != "$2" ]; then
		echo "FAIL $1: want $2, got $status"
		echo "$out"
		fails=$((fails + 1))
	elif [ -n "${4:-}" ] && ! grep -qF -- "$4" <<<"$out"; then
		echo "FAIL $1: output lacks '$4'"
		echo "$out"
		fails=$((fails + 1))
	else
		echo "ok   $1 (want $2)"
	fi
	rm -rf "$3"
}

dir=$(scratch)
printf '%s\nALTER TABLE "plants" ADD COLUMN "x" text;\n' "$GUARD" >"$dir/$DB/0000_a.sql"
printf -- '-- why this runs\n\n%s\nUPDATE "plants" SET "x" = 1;\n' "$GUARD" >"$dir/$DB/0001_b.sql"
echo 'CREATE TABLE "t" ("p" uuid REFERENCES "plants" ON DELETE CASCADE ON UPDATE CASCADE);' >"$dir/$DB/0002_c.sql"
echo 'INSERT INTO "t" VALUES (1) ON CONFLICT DO UPDATE SET "p" = 1;' >"$dir/$DB/0003_d.sql"
printf -- '-- migrate:no-transaction\nALTER TABLE "plants" ADD COLUMN "y" text;\n' >"$dir/$DB/0004_e.sql"
echo 'SELECT 1;' >"$dir/$KNOWLEDGE/0000_a.sql"
expect "guarded, lock-free and no-transaction files pass" pass "$dir"

dir=$(scratch)
echo 'SELECT 1;' >"$dir/$DB/0000_a.sql"
echo 'SELECT 1;' >"$dir/$DB/0001_b.sql"
echo 'SELECT 1;' >"$dir/$DB/0001_c.sql"
expect "a shared number fails" fail "$dir" "0001_b.sql 0001_c.sql share number 0001. Rename the one main does not have yet to the next unused number 0002"

dir=$(scratch)
echo 'SELECT 1;' >"$dir/$DB/0025_add_social_tables.sql"
echo 'SELECT 1;' >"$dir/$DB/0025_safe_darwin.sql"
expect "the grandfathered 0025 pair passes" pass "$dir"

dir=$(scratch)
echo 'SELECT 1;' >"$dir/$DB/0025_add_social_tables.sql"
echo 'SELECT 1;' >"$dir/$DB/0025_safe_darwin.sql"
echo 'SELECT 1;' >"$dir/$DB/0025_new.sql"
expect "a third file on a grandfathered number fails" fail "$dir" "0025_new.sql 0025_safe_darwin.sql share number 0025"

dir=$(scratch)
echo 'SELECT 1;' >"$dir/$KNOWLEDGE/0004_a.sql"
echo 'SELECT 1;' >"$dir/$KNOWLEDGE/0004_b.sql"
expect "a shared knowledge-db number fails" fail "$dir" "next unused number 0005"

dir=$(scratch)
echo 'SELECT 1;' >"$dir/$DB/add_plants.sql"
expect "an unnumbered file fails" fail "$dir" "Rename it to 0000_<name>.sql"

dir=$(scratch)
echo 'ALTER TABLE "plants" ADD COLUMN "x" text;' >"$dir/$DB/0000_a.sql"
expect "an unguarded ALTER TABLE fails" fail "$dir" "Add SET LOCAL lock_timeout = '5s';"

dir=$(scratch)
echo 'DELETE FROM "plants";' >"$dir/$DB/0000_a.sql"
expect "an unguarded DELETE fails" fail "$dir" "lock_timeout"

dir=$(scratch)
printf 'UPDATE "plants" SET "x" = 1;\n%s\n' "$GUARD" >"$dir/$DB/0000_a.sql"
expect "a lock_timeout after the first statement fails" fail "$dir" "lock_timeout"

dir=$(scratch)
printf "SET LOCAL lock_timeout = '5s';\nUPDATE \"plants\" SET \"x\" = 1;\n" >"$dir/$DB/0000_a.sql"
expect "a lock_timeout without its breakpoint fails" fail "$dir" "statement-breakpoint"

dir=$(scratch)
echo 'ALTER TABLE "plants" ADD COLUMN "x" text;' >"$dir/$DB/0083_care_day_unique.sql"
expect "a grandfathered unguarded file passes" pass "$dir"

[ "$fails" -eq 0 ] || exit 1
