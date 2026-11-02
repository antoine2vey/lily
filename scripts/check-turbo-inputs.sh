#!/usr/bin/env bash

set -euo pipefail

ROOT_CONFIGS=(tsconfig.json biome.json)

dry=$(bun x turbo run lint tsc test build --dry=json)
failed=0

for file in "${ROOT_CONFIGS[@]}"; do
  if ! jq -e --arg f "$file" '.globalCacheInputs.files | has($f)' <<< "$dry" > /dev/null; then
    echo "Root $file is not in the Turbo global hash (turbo.json globalDependencies)."
    failed=1
  fi
done

while IFS=$'\t' read -r task dir; do
  missing=$(comm -23 \
    <(git ls-files -- "$dir" | sed "s#^$dir/##" | sort) \
    <(jq -r --arg t "$task" '.tasks[] | select(.taskId == $t) | .inputs | keys[]' <<< "$dry" | sort))
  if [[ -n "$missing" ]]; then
    echo "$task does not hash $(wc -l <<< "$missing" | tr -d ' ') tracked files, e.g.:"
    head -5 <<< "$missing" | sed 's/^/  /'
    failed=1
  fi
done < <(jq -r '.tasks[] | select(.resolvedTaskDefinition.cache) | [.taskId, .directory] | @tsv' <<< "$dry")

if (( failed )); then
  echo ''
  echo 'Turbo would replay cached results for changes it does not hash.'
  echo 'Drop the narrow "inputs" list in turbo.json, or add the missing files to it.'
  exit 1
fi

echo 'Every cached Turbo task hashes all tracked files of its package.'
