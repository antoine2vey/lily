#!/usr/bin/env bash
# Fails when two migrations in one folder share a number, or when a migration
# in packages/db/drizzle/ updates, alters or deletes without first bounding
# its lock waits. The migrator records each file by name and runs a renamed
# file again, so the files below that predate these rules keep their names
# and are exempt by name. A `-- migrate:no-transaction` file is exempt from
# the lock check, because SET LOCAL does nothing outside a transaction.
set -euo pipefail

cd "$(dirname "$0")/.."

SHARED_NUMBER_OK='
packages/db/drizzle/0025_add_social_tables.sql
packages/db/drizzle/0025_safe_darwin.sql
packages/db/drizzle/0090_catalog_lux_matches_lighting_rating.sql
packages/db/drizzle/0090_plant_rating_zero_backfill.sql
'

UNBOUNDED_LOCKS_OK='
packages/db/drizzle/0000_wide_lake.sql
packages/db/drizzle/0001_organic_screwball.sql
packages/db/drizzle/0003_dizzy_blacklash.sql
packages/db/drizzle/0004_huge_flatman.sql
packages/db/drizzle/0005_empty_husk.sql
packages/db/drizzle/0006_reflective_banshee.sql
packages/db/drizzle/0007_smart_odin.sql
packages/db/drizzle/0008_zippy_arachne.sql
packages/db/drizzle/0009_slippery_shard.sql
packages/db/drizzle/0010_massive_marauders.sql
packages/db/drizzle/0011_colossal_ronan.sql
packages/db/drizzle/0012_happy_justin_hammer.sql
packages/db/drizzle/0013_regular_turbo.sql
packages/db/drizzle/0014_curved_mathemanic.sql
packages/db/drizzle/0015_striped_salo.sql
packages/db/drizzle/0017_add_language_field.sql
packages/db/drizzle/0018_funny_the_liberteens.sql
packages/db/drizzle/0019_broken_supreme_intelligence.sql
packages/db/drizzle/0020_bizarre_psynapse.sql
packages/db/drizzle/0021_low_master_mold.sql
packages/db/drizzle/0022_big_proemial_gods.sql
packages/db/drizzle/0023_faithful_slayback.sql
packages/db/drizzle/0024_rename_image_url_to_image_key.sql
packages/db/drizzle/0025_add_social_tables.sql
packages/db/drizzle/0025_safe_darwin.sql
packages/db/drizzle/0026_freezing_smasher.sql
packages/db/drizzle/0027_faithful_the_captain.sql
packages/db/drizzle/0028_far_agent_zero.sql
packages/db/drizzle/0030_left_lord_tyger.sql
packages/db/drizzle/0031_silent_lucky_pierre.sql
packages/db/drizzle/0032_plain_menace.sql
packages/db/drizzle/0033_common_talos.sql
packages/db/drizzle/0034_broken_hex.sql
packages/db/drizzle/0036_huge_eddie_brock.sql
packages/db/drizzle/0037_colorful_corsair.sql
packages/db/drizzle/0039_eminent_kree.sql
packages/db/drizzle/0040_spicy_big_bertha.sql
packages/db/drizzle/0041_replace_pot_size_with_dimensions.sql
packages/db/drizzle/0042_add_user_soft_delete.sql
packages/db/drizzle/0044_normalize_environment_ratings.sql
packages/db/drizzle/0047_add_activity_push_tokens.sql
packages/db/drizzle/0048_la_token_confirmation.sql
packages/db/drizzle/0049_unify_chat_conversations.sql
packages/db/drizzle/0050_add_oauth_identities.sql
packages/db/drizzle/0051_add_user_first_last_name.sql
packages/db/drizzle/0052_add_room_orientation.sql
packages/db/drizzle/0053_add_vacation_mode.sql
packages/db/drizzle/0054_add_activity_last_start_sent_at.sql
packages/db/drizzle/0056_drop_diagnosis_status.sql
packages/db/drizzle/0057_plant_death.sql
packages/db/drizzle/0060_notification_delivery_claims.sql
packages/db/drizzle/0061_mcp_default_scopes.sql
packages/db/drizzle/0066_notification_metadata.sql
packages/db/drizzle/0072_care_log_care_day.sql
packages/db/drizzle/0073_schedule_always_due.sql
packages/db/drizzle/0074_schedule_due_day.sql
packages/db/drizzle/0075_reminder_occasion.sql
packages/db/drizzle/0083_care_day_unique.sql
packages/db/drizzle/0084_reminder_occasion_backfill.sql
packages/db/drizzle/0086_plant_ratings_0_100.sql
packages/db/drizzle/0087_catalog_pet_toxicity.sql
packages/db/drizzle/0090_catalog_lux_matches_lighting_rating.sql
'

LOCK_TIMEOUT="SET LOCAL lock_timeout = '5s';"
BREAKPOINT='--> statement-breakpoint'
RISKY='^(?!\s*--).*?(\bALTER\s+TABLE\b|\bDELETE\s+FROM\b|(?<!\bON\s)(?<!\bDO\s)(?<!\bFOR\s)\bUPDATE\b)'

failed=0

listed() { # listed <list> <path>
	grep -qxF "$2" <<<"$1"
}

migrations() { # migrations <folder>
	git ls-files --cached --others --exclude-standard -- "$1/*.sql" | sort -u |
		while read -r file; do [ ! -f "$file" ] || echo "$file"; done
}

check_numbers() { # check_numbers <folder>
	local files numbers last next=0000 file number group
	files=$(migrations "$1")
	[ -n "$files" ] || return 0
	numbers=$(sed -nE 's|.*/([0-9]{4})_[^/]*$|\1|p' <<<"$files" | sort)
	last=$(tail -1 <<<"$numbers")
	[ -z "$last" ] || next=$(printf '%04d' $((10#$last + 1)))
	for file in $(grep -vE '/[0-9]{4}_[^/]*$' <<<"$files" || true); do
		echo "$file: the migrator applies files in name order. Rename it to ${next}_<name>.sql." >&2
		failed=1
	done
	for number in $(uniq -d <<<"$numbers"); do
		group=$(grep "/${number}_" <<<"$files")
		for file in $group; do
			if ! listed "$SHARED_NUMBER_OK" "$file"; then
				echo "$1: $(xargs -n1 basename <<<"$group" | xargs) share number $number. Rename the one main does not have yet to the next unused number $next. The migrator records a file by name, so a merged file runs again under a new name." >&2
				failed=1
				break
			fi
		done
	done
}

starts_with_lock_timeout() { # starts_with_lock_timeout <file>
	awk -v set="$LOCK_TIMEOUT" -v breakpoint="$BREAKPOINT" '
		{ sub(/[[:space:]]+$/, "") }
		$0 == "" { next }
		!seen && /^[[:space:]]*--/ { next }
		!seen { if ($0 != set) exit 1; seen = 1; next }
		{ exit ($0 == breakpoint) ? 0 : 1 }
		END { if (!seen) exit 1 }
	' "$1"
}

check_lock_timeouts() { # check_lock_timeouts <folder>
	local file
	for file in $(git grep --untracked -lIiP "$RISKY" -- "$1/*.sql"); do
		listed "$UNBOUNDED_LOCKS_OK" "$file" && continue
		head -1 "$file" | grep -qxF -- '-- migrate:no-transaction' && continue
		starts_with_lock_timeout "$file" && continue
		echo "$file: it updates, alters or deletes rows, so a lock wait could stall every query behind it. Add $LOCK_TIMEOUT and a $BREAKPOINT line at the top, before the first statement." >&2
		failed=1
	done
}

check_numbers packages/db/drizzle
check_numbers packages/knowledge-db/drizzle
check_lock_timeouts packages/db/drizzle

exit "$failed"
