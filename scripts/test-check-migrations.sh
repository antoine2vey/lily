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

fill() { # fill <dir> <last number>: lock-free files 0000 to <last>, skipping 0059 as packages/db does
	local n
	for n in $(seq -f '%04g' 0 "$2"); do
		[ "$n" = 0059 ] || echo 'SELECT 1;' >"$1/$DB/${n}_filler.sql"
	done
}

expect() { # expect <name> <pass|fail> <dir> [output substring]
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
	chmod -R u+r "$3"
	rm -rf "$3"
}

dir=$(scratch)
printf '%s\nALTER TABLE "plants" ADD COLUMN "x" text;\n' "$GUARD" >"$dir/$DB/0000_a.sql"
printf -- '-- why this runs\n\n%s\nUPDATE "plants" SET "x" = 1;\n' "$GUARD" >"$dir/$DB/0001_b.sql"
printf '%s\nCREATE TABLE "t" ("p" uuid REFERENCES "plants" ON DELETE CASCADE ON UPDATE CASCADE);\n' "$GUARD" >"$dir/$DB/0002_c.sql"
echo 'INSERT INTO "t" VALUES (1) ON CONFLICT DO UPDATE SET "p" = 1;' >"$dir/$DB/0003_d.sql"
echo 'CREATE TABLE "u" ("id" uuid PRIMARY KEY, "note" text);' >"$dir/$DB/0006_g.sql"
cat >"$dir/$DB/0004_e.sql" <<'SQL'
-- migrate:no-transaction
SET lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN DROP INDEX "t_p_idx"; END $$;
--> statement-breakpoint
RESET lock_timeout;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "t_p_idx" ON "t" ("p");
SQL
printf -- '-- migrate:no-transaction\nDROP INDEX CONCURRENTLY IF EXISTS "t_p_idx";\n' >"$dir/$DB/0005_f.sql"
echo 'SELECT 1;' >"$dir/$KNOWLEDGE/0000_a.sql"
expect "guarded and lock-free files pass" pass "$dir"

dir=$(scratch)
fill "$dir" 0001
echo 'SELECT 1;' >"$dir/$DB/0001_c.sql"
expect "a shared number fails" fail "$dir" "0001_c.sql 0001_filler.sql share number 0001. Rename the one main does not have yet to the next unused number 0002"

dir=$(scratch)
fill "$dir" 0024
echo 'SELECT 1;' >"$dir/$DB/0025_add_social_tables.sql"
echo 'SELECT 1;' >"$dir/$DB/0025_safe_darwin.sql"
expect "the grandfathered 0025 pair passes" pass "$dir"

dir=$(scratch)
fill "$dir" 0024
echo 'SELECT 1;' >"$dir/$DB/0025_add_social_tables.sql"
echo 'SELECT 1;' >"$dir/$DB/0025_safe_darwin.sql"
echo 'SELECT 1;' >"$dir/$DB/0025_new.sql"
expect "a third file on a grandfathered number fails" fail "$dir" "0025_new.sql 0025_safe_darwin.sql share number 0025"

dir=$(scratch)
echo 'SELECT 1;' >"$dir/$KNOWLEDGE/0000_a.sql"
echo 'SELECT 1;' >"$dir/$KNOWLEDGE/0000_b.sql"
expect "a shared knowledge-db number fails" fail "$dir" "next unused number 0001"

dir=$(scratch)
echo 'SELECT 1;' >"$dir/$DB/add_plants.sql"
expect "an unnumbered file fails" fail "$dir" "Rename it to 0000_<name>.sql"

dir=$(scratch)
fill "$dir" 0001
echo 'SELECT 1;' >"$dir/$DB/0003_c.sql"
expect "a number past a gap fails" fail "$dir" "no migration takes number 0002, below 0003. A new file takes the number after the highest, so rename 0003_c.sql to number 0002."

dir=$(scratch)
fill "$dir" 0091
echo 'SELECT 1;' >"$dir/$DB/0059_fill.sql"
expect "a file in the skipped 0059 fails" fail "$dir" "0059_fill.sql: later migrations already ran, so production would apply it after them. Rename it to the next unused number 0092."

set -- \
	'ALTER TABLE' 'ALTER TABLE "plants" ADD COLUMN "x" text;' \
	'ALTER TABLE across lines' $'ALTER\n\tTABLE "plants" ADD COLUMN "x" text;' \
	'DELETE FROM' 'DELETE FROM "plants";' \
	'DELETE FROM across lines' $'DELETE\n  FROM "plants";' \
	'UPDATE' 'UPDATE "plants" SET "x" = 1;' \
	'DROP TABLE' 'DROP TABLE "plants";' \
	'DROP INDEX' 'DROP INDEX "plants_x_idx";' \
	'TRUNCATE' 'TRUNCATE "plants";' \
	'LOCK TABLE' 'LOCK TABLE "plants" IN SHARE MODE;' \
	'CREATE INDEX' 'CREATE INDEX "plants_x_idx" ON "plants" ("x");' \
	'CREATE UNIQUE INDEX' 'CREATE UNIQUE INDEX "plants_x_idx" ON "plants" ("x");' \
	'CREATE TRIGGER' 'CREATE TRIGGER "t" BEFORE INSERT ON "plants" FOR EACH ROW EXECUTE FUNCTION f();' \
	'CREATE OR REPLACE TRIGGER' 'CREATE OR REPLACE TRIGGER "t" BEFORE INSERT ON "plants" FOR EACH ROW EXECUTE FUNCTION f();' \
	'CREATE CONSTRAINT TRIGGER' 'CREATE CONSTRAINT TRIGGER "t" AFTER INSERT ON "plants" FOR EACH ROW EXECUTE FUNCTION f();' \
	'DROP TRIGGER' 'DROP TRIGGER IF EXISTS "t" ON "plants";' \
	'CREATE TABLE with REFERENCES' 'CREATE TABLE "t" ("p" uuid NOT NULL REFERENCES "plants"("id") ON DELETE CASCADE);'
while [ $# -gt 0 ]; do
	dir=$(scratch)
	echo "$2" >"$dir/$DB/0000_a.sql"
	expect "an unguarded $1 fails" fail "$dir" "Add SET LOCAL lock_timeout = '5s';"
	shift 2
done

dir=$(scratch)
printf 'UPDATE "plants" SET "x" = 1;\n%s\n' "$GUARD" >"$dir/$DB/0000_a.sql"
expect "a lock_timeout after the first statement fails" fail "$dir" "SET LOCAL lock_timeout"

dir=$(scratch)
printf "SET LOCAL lock_timeout = '5s';\nUPDATE \"plants\" SET \"x\" = 1;\n" >"$dir/$DB/0000_a.sql"
expect "a lock_timeout without its breakpoint fails" fail "$dir" "SET LOCAL lock_timeout"

dir=$(scratch)
printf -- '-- migrate:no-transaction\nALTER TABLE "plants" ADD COLUMN "x" text;\n' >"$dir/$DB/0000_a.sql"
expect "an unguarded no-transaction ALTER fails" fail "$dir" "Add SET lock_timeout = '5s'; before the first such statement and RESET lock_timeout; after the last"

dir=$(scratch)
printf -- "-- migrate:no-transaction\nSET lock_timeout = '5s';\n--> statement-breakpoint\nDROP INDEX \"x\";\n" >"$dir/$DB/0000_a.sql"
expect "a no-transaction file without RESET fails" fail "$dir" "RESET lock_timeout;"

dir=$(scratch)
printf -- "-- migrate:no-transaction\nDROP INDEX \"x\";\n--> statement-breakpoint\nSET lock_timeout = '5s';\n--> statement-breakpoint\nRESET lock_timeout;\n" >"$dir/$DB/0000_a.sql"
expect "a no-transaction SET after the lock fails" fail "$dir" "RESET lock_timeout;"

dir=$(scratch)
fill "$dir" 0082
echo 'ALTER TABLE "plants" ADD COLUMN "x" text;' >"$dir/$DB/0083_care_day_unique.sql"
expect "a grandfathered unguarded file passes" pass "$dir"

dir=$(scratch)
echo 'SELECT 1;' >"$dir/$DB/0000_a.sql"
chmod 000 "$dir/$DB/0000_a.sql"
expect "an unreadable file fails" fail "$dir" "could not check it"

dir=$(scratch)
rm -rf "$dir/.git"
echo 'ALTER TABLE "plants" ADD COLUMN "x" text;' >"$dir/$DB/0000_a.sql"
expect "a git failure fails" fail "$dir" "not a git repository"

[ "$fails" -eq 0 ] || exit 1
