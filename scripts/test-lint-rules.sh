#!/usr/bin/env bash
# Lints lint/__fixtures__/<rule>.ts with lint/<rule>.grit alone, and fails
# unless the rule reports exactly one diagnostic on each line that ends in
# `// flag` and none on any other line. Every rule needs a fixture.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# The CI docs job has Bun but no install, so it fetches the pinned Biome.
if [ -x "$root/node_modules/.bin/biome" ]; then
	biome=("$root/node_modules/.bin/biome")
else
	biome=(bun x "@biomejs/biome@$(jq -r '.devDependencies["@biomejs/biome"]' "$root/package.json")")
fi
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fails=0

for rule in "$root"/lint/*.grit; do
	name=$(basename "$rule" .grit)
	fixture="$root/lint/__fixtures__/$name.ts"
	if [ ! -f "$fixture" ]; then
		echo "FAIL $name: no fixture at lint/__fixtures__/$name.ts"
		fails=$((fails + 1))
		continue
	fi
	dir="$work/$name"
	mkdir "$dir"
	cp "$fixture" "$dir/fixture.ts"
	printf '{"plugins":["%s"],"linter":{"rules":{"preset":"none"}},"formatter":{"enabled":false},"assist":{"enabled":false}}\n' \
		"$rule" >"$dir/biome.json"

	out=$(cd "$dir" && "${biome[@]}" lint --colors=off --max-diagnostics=1000 fixture.ts 2>&1) || true
	if grep -qE 'rule errored|during loading of plugins' <<<"$out"; then
		echo "FAIL $name: the rule did not run"
		echo "$out"
		fails=$((fails + 1))
		continue
	fi
	want=$(grep -n '// flag$' "$dir/fixture.ts" | cut -d: -f1 | paste -sd' ' -)
	got=$(sed -nE 's/^fixture\.ts:([0-9]+):[0-9]+ plugin.*/\1/p' <<<"$out" | sort -n | paste -sd' ' -)
	if [ "$want" = "$got" ]; then
		echo "ok   $name flags lines $want"
	else
		echo "FAIL $name"
		echo "  want lines: $want"
		echo "  got lines:  $got"
		fails=$((fails + 1))
	fi
done

[ "$fails" -eq 0 ] || { echo "$fails rule(s) failed"; exit 1; }
