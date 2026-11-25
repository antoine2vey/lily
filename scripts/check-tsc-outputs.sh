#!/usr/bin/env bash

set -uo pipefail

CHECK_INFO=tsconfig.check.tsbuildinfo

build_infos() {
  find "$1" -name '*.tsbuildinfo' -not -name "$CHECK_INFO" -not -path '*/node_modules/*'
}

failed=0
dirs=()
filters=()

for manifest in packages/*/package.json; do
  dir=$(dirname "$manifest")
  if jq -e '.scripts.build | strings | test("(^|[;&| ])tsc [^;&|]*(--build|-b)( |$)")' "$manifest" > /dev/null; then
    echo "$dir: the build script runs tsc --build."
    echo '  Build mode rewrites the dist of every referenced package while the tasks that read it run.'
    echo '  Turbo already builds the dependencies first (^build), so use tsc -p.'
    failed=1
  fi
  if jq -e '.scripts | has("tsc") and has("build")' "$manifest" > /dev/null \
    && grep -q '"composite": true' "$dir/tsconfig.json" 2> /dev/null; then
    dirs+=("$dir")
    filters+=("--filter=$(jq -r .name "$manifest")^...")
  fi
done

bun x turbo run build "${filters[@]}" --output-logs=errors-only > /dev/null || {
  echo 'Could not build the dependencies of the composite packages.'
  exit 1
}

for dir in "${dirs[@]}"; do
  aside=$(mktemp -d)
  while IFS= read -r info; do
    mkdir -p "$aside/$(dirname "$info")"
    mv "$info" "$aside/$info"
  done < <(build_infos "$dir")

  if ! log=$(cd "$dir" && bun run tsc 2>&1); then
    echo "$dir: the tsc script failed:"
    tail -20 <<< "$log" | sed 's/^/  /'
    failed=1
  fi

  while IFS= read -r info; do
    echo "$dir: the tsc script wrote $info."
    echo "  A check writes its build info to $CHECK_INFO only. The build reads and writes every other one."
    rm -f "$info"
    failed=1
  done < <(build_infos "$dir")

  if [[ -d "$aside/$dir" ]]; then
    cp -Rp "$aside/$dir/." "$dir/"
  fi
  rm -rf "$aside"
done

if (( failed )); then
  exit 1
fi

echo "The check of each of the ${#dirs[@]} composite packages writes only its own build info, and no build runs tsc --build."
