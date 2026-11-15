#!/usr/bin/env bash
# Checks that the markdown docs point at things that exist.
#   1. Relative links resolve from the linking file, and a #fragment names a
#      heading in the target markdown file.
#   2. Backticked file paths resolve from the doc's directory, its package,
#      the package's src/ or the repo root, or match the tail of a repo file.
#   3. Every package has CLAUDE.md, README.md, CONTEXT.md and an AGENTS.md
#      symlink to CLAUDE.md, and is named in the root CONTEXT-MAP.md and
#      packages/README.md.
#   4. Bun, Effect and TypeScript versions quoted in docs match package.json.
set -euo pipefail

cd "$(dirname "$0")/.."

errors=0
fail() {
	echo "$1"
	errors=$((errors + 1))
}

# GitHub's heading anchors: lowercase, punctuation dropped, spaces to
# hyphens, and a -N suffix on repeats.
slugs() {
	awk '
		/^[[:space:]]*(```|~~~)/ { fence = !fence; next }
		fence || !/^#+ / { next }
		{
			s = tolower($0)
			sub(/^#+ +/, "", s)
			gsub(/[^a-z0-9 _-]/, "", s)
			gsub(/ /, "-", s)
			n = seen[s]++
			print (n ? s "-" n : s)
		}
	' "$1"
}

docs=$(git ls-files --cached --others --exclude-standard '*.md' | grep -v '^packages/web/content/posts/' | sort -u)

spans=$(
	for doc in $docs; do
		[ -f "$doc" ] || continue
		awk -v file="$doc" '
			/^[[:space:]]*(```|~~~)/ { fence = !fence; next }
			fence { next }
			{
				s = $0
				while (match(s, /\]\([^)]+\)/)) {
					print file "\t" FNR "\tlink\t" substr(s, RSTART + 2, RLENGTH - 3)
					s = substr(s, RSTART + RLENGTH)
				}
				s = $0
				while (match(s, /`[^`]+`/)) {
					print file "\t" FNR "\tcode\t" substr(s, RSTART + 1, RLENGTH - 2)
					s = substr(s, RSTART + RLENGTH)
				}
			}
		' "$doc"
	done
)

path_like='^[A-Za-z0-9_.][A-Za-z0-9_.@$-]*(/[A-Za-z0-9_.@$()[-]+)*/?$'
file_like='(/|\.(md|mdx|ts|tsx|js|mjs|cjs|json|jsonc|sh|sql|yml|yaml|toml|css|html|conf|png|jpg|svg|txt|swift|plist))$'
repo_files=$(git ls-files --cached --others --exclude-standard | sed 's|^|/|')

while IFS=$'\t' read -r doc line kind target; do
	[ -n "${doc:-}" ] || continue
	dir=.
	[[ "$doc" == */* ]] && dir="${doc%/*}"
	case "$kind" in
	link)
		target="${target%% *}"
		anchor=""
		[[ "$target" == *#* ]] && anchor="${target#*#}"
		target="${target%%#*}"
		case "$target" in
		http:* | https:* | mailto:* | /* | \<*) continue ;;
		esac
		file="$doc"
		if [ -n "$target" ]; then
			file="$dir/$target"
			[ -e "$file" ] || {
				fail "$doc:$line: broken link -> $target"
				continue
			}
		fi
		if [ -n "$anchor" ] && [[ "$file" == *.md && -f "$file" ]]; then
			grep -qxF -- "$anchor" <<<"$(slugs "$file")" || fail "$doc:$line: broken anchor -> $target#$anchor"
		fi
		;;
	code)
		[[ "$target" =~ $path_like ]] || continue
		[[ "$target" == ?*/?* && "$target" =~ $file_like ]] || [[ "$target" == *.md ]] || continue
		case "$target" in
		dist/* | */dist/* | node_modules/* | */node_modules/* | ios/* | android/* | */ios/* | */android/* | my-* | */my-*) continue ;;
		esac
		pkg=""
		if [[ "$doc" == packages/*/* ]]; then
			rest="${doc#packages/}"
			pkg="packages/${rest%%/*}"
		fi
		found=""
		for base in "$dir" "." ${pkg:+"$pkg"} ${pkg:+"$pkg/src"}; do
			if [ -e "$base/$target" ]; then
				found=1
				break
			fi
		done
		if [ -z "$found" ] && grep -qF -- "/${target#./}" <<<"$repo_files"; then
			found=1
		fi
		[ -n "$found" ] || fail "$doc:$line: missing path -> \`$target\`"
		;;
	esac
done <<<"$spans"

for manifest in packages/*/package.json; do
	pkg=$(dirname "$manifest")
	name=$(basename "$pkg")
	for f in CLAUDE.md README.md CONTEXT.md; do
		[ -f "$pkg/$f" ] || fail "$pkg: missing $f"
	done
	if [ "$(readlink "$pkg/AGENTS.md" 2>/dev/null || true)" != "CLAUDE.md" ]; then
		fail "$pkg: AGENTS.md is not a symlink to CLAUDE.md"
	fi
	grep -q "packages/$name" CONTEXT-MAP.md || fail "CONTEXT-MAP.md: packages/$name is not mapped"
	grep -q "$name" packages/README.md || fail "packages/README.md: $name is not listed"
done

bun_version=$(sed -nE 's/.*"packageManager": "bun@([0-9.]+)".*/\1/p' package.json)
effect_version=$(sed -nE 's/^    "effect": "([0-9.]+)".*/\1/p' package.json | head -1)
ts_version=$(sed -nE 's/^    "typescript": "([0-9.]+)".*/\1/p' package.json | head -1)
for doc in $docs; do
	[ -f "$doc" ] || continue
	while IFS=: read -r line quoted; do
		[ -n "${line:-}" ] || continue
		case "$quoted" in
		"Bun $bun_version" | "Effect $effect_version" | "TypeScript $ts_version") ;;
		*) fail "$doc:$line: '$quoted' does not match package.json (Bun $bun_version, Effect $effect_version, TypeScript $ts_version)" ;;
		esac
	done < <(grep -noE '\b(Bun|Effect|TypeScript) [0-9]+\.[0-9]+\.[0-9]+' "$doc" || true)
done

if [ "$errors" -gt 0 ]; then
	echo "check-docs: $errors problem(s)"
	exit 1
fi
echo "check-docs: ok"
