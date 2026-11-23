#!/usr/bin/env bash
# Simulates every Quint model below and compares each verdict with the one
# written beside it, then runs each module's scenario tests. The model of
# today's code must hold its invariant. The model of a past bug, or of
# today's code without an assumption the passing model leans on, must break
# it, so a model that stops catching its incident fails here.
# `quint run` samples traces and proves nothing: "holds" means no violation
# in SAMPLES seeded traces of STEPS steps. The Rust backend needs no Java.
# Usage: scripts/check-models.sh [file.qnt]
set -euo pipefail

cd "$(dirname "$0")/.."

QUINT=(npx -y @informalsystems/quint@0.34.0)
STEPS=30
SAMPLES=30000
SEED=0x11

# file module invariants verdict
MODELS='
packages/api/models/la-start.qnt la_current noDuplicateCard,confirmedStartNeverBlocks holds
packages/api/models/la-start.qnt la_no_guard noDuplicateCard breaks
packages/api/models/la-start.qnt la_cooldown15 noDuplicateCard breaks
packages/api/models/la-start.qnt la_check_then_send noDuplicateCard breaks
packages/api/models/la-start.qnt la_hard_cap_12h noDuplicateCard breaks
packages/api/models/la-start.qnt la_confirm_mid_batch noDuplicateCard breaks
'

only=${1:-}
fails=0
ran=0

while read -r file module invariants verdict; do
	[ -n "$file" ] || continue
	[ -z "$only" ] || [ "$only" = "$file" ] || continue
	ran=$((ran + 1))
	out=$("${QUINT[@]}" run "$file" --main="$module" --invariants ${invariants//,/ } \
		--max-steps=$STEPS --max-samples=$SAMPLES --seed=$SEED --backend=rust 2>&1) || true
	if grep -qF '[ok] No violation found' <<<"$out"; then
		got=holds
	elif grep -qF '[violation]' <<<"$out"; then
		got=breaks
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

	out=$("${QUINT[@]}" test "$file" --main="$module" 2>&1) && status=0 || status=$?
	if [ "$status" -ne 0 ] || ! grep -qE '^ +[0-9]+ passing' <<<"$out" || grep -qE '^ +[0-9]+ failed' <<<"$out"; then
		echo "FAIL $module scenario tests"
		tail -n 40 <<<"$out"
		fails=$((fails + 1))
	else
		echo "ok   $module $(grep -cE '^ +ok ' <<<"$out") scenario test(s)"
	fi
done <<<"$MODELS"

if [ "$ran" -eq 0 ]; then
	echo "No model matches ${only:-the list}."
	exit 2
fi
if [ "$fails" -gt 0 ]; then
	echo "$fails model check(s) failed."
	exit 1
fi
echo "Every model gave its expected verdict."
