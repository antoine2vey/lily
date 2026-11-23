#!/usr/bin/env bash
# Checks every Quint model against the verdict written beside it below, then
# runs each module's scenario tests. The model of today's code must hold its
# invariant. The model of a past bug, or of today's code without an assumption
# the passing model leans on, must break it, so a model that stops catching
# its incident fails here. So does a module missing from the list.
# `quint run` samples traces and proves nothing: "holds" means no violation
# in SAMPLES seeded traces of STEPS steps. A gap too deep to sample is listed
# as "scenarios": a named run in its module ends in the violation.
# The Rust backend needs no Java.
# Usage: scripts/check-models.sh [file.qnt]
set -euo pipefail

cd "$(dirname "$0")/.."

QUINT=(npx -y @informalsystems/quint@0.34.0)
STEPS=30
SAMPLES=30000
SEED=0x11

# file module invariants verdict # why
MODELS='
packages/api/models/la-start.qnt la_current noDuplicateCard holds
packages/api/models/la-start.qnt la_current oneCardOnScreen breaks # 367 gaps 3 and 4
packages/api/models/la-start.qnt la_no_guard noDuplicateCard breaks # 258941ed
packages/api/models/la-start.qnt la_cooldown15 noDuplicateCard breaks # c474de2e
packages/api/models/la-start.qnt la_check_then_send noDuplicateCard breaks # before 82
packages/api/models/la-start.qnt la_hard_cap_12h noDuplicateCard breaks # 367 gap 1
packages/api/models/la-start.qnt la_confirm_mid_batch noDuplicateCard breaks # 367 gap 2
packages/api/models/la-start.qnt la_lost_post - scenarios # 367 gap 2
'

only=${1:-}
fails=0
ran=0

tested=' '

while read -r file module invariants verdict _; do
	[ -n "$file" ] || continue
	[ -z "$only" ] || [ "$only" = "$file" ] || continue
	ran=$((ran + 1))
	if [ "$verdict" != scenarios ]; then
		out=$("${QUINT[@]}" run "$file" --main="$module" --invariants ${invariants//,/ } \
			--max-steps=$STEPS --max-samples=$SAMPLES --seed=$SEED --backend=rust 2>&1) || true
		if grep -qF '[ok] No violation found' <<<"$out"; then
			got=holds
		elif grep -qF '[violation]' <<<"$out" && grep -qF '[State 1]' <<<"$out"; then
			got=breaks
		elif grep -qF '[violation]' <<<"$out"; then
			got='breaks in its first state'
		else
			got=errored
		fi
		if [ "$got" = "$verdict" ]; then
			echo "ok   $module $verdict $invariants"
		else
			echo "FAIL $module $got $invariants, expected $verdict"
			tail -n 40 <<<"$out"
			fails=$((fails + 1))
		fi
	fi

	case "$tested" in *" $file:$module "*) continue ;; esac
	tested="$tested$file:$module "
	out=$("${QUINT[@]}" test "$file" --main="$module" 2>&1) && status=0 || status=$?
	if [ "$status" -ne 0 ] || ! grep -qE '^ +[0-9]+ passing' <<<"$out" || grep -qE '^ +[0-9]+ failed' <<<"$out"; then
		echo "FAIL $module scenario tests"
		tail -n 40 <<<"$out"
		fails=$((fails + 1))
	else
		echo "ok   $module $(grep -cE '^ +ok ' <<<"$out") scenario test(s)"
	fi
done <<<"$MODELS"

while read -r file; do
	[ -z "$only" ] || [ "$only" = "$file" ] || continue
	while read -r module; do
		grep -qE "^ *import $module\\(" "$file" && continue
		case "$tested" in *" $file:$module "*) continue ;; esac
		echo "FAIL $module in $file is not in the list in scripts/check-models.sh"
		fails=$((fails + 1))
	done < <(sed -nE 's/^module ([A-Za-z0-9_]+).*/\1/p' "$file")
done < <(git ls-files '*.qnt')

if [ "$ran" -eq 0 ]; then
	echo "No model matches ${only:-the list}."
	exit 2
fi
if [ "$fails" -gt 0 ]; then
	echo "$fails model check(s) failed."
	exit 1
fi
echo "Every model gave its expected verdict."
