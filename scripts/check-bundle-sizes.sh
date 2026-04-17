#!/usr/bin/env bash
# Fails CI if a bundle category exceeds its budget.
# Budgets are ~1.5x current sizes as of 2026-04-16. Tighten once stable.
# admin/js raised 2026-04-17 to accommodate Recharts (analytics dashboard);
# admin is internal-only so its budget tracks web/js.

set -euo pipefail

# Format: "label dir glob budget_bytes"
BUDGETS=(
  "web/js     packages/web/out/_next/static/chunks   *.js   1258291"   # 1.2 MB
  "web/css    packages/web/out/_next/static/chunks   *.css  40960"     # 40 KB
  "admin/js   packages/admin/dist/assets             *.js   1258291"   # 1.2 MB
  "admin/css  packages/admin/dist/assets             *.css  30720"     # 30 KB
)

fmt_bytes() {
  local b=$1
  if (( b >= 1048576 )); then
    awk "BEGIN { printf \"%.1f MB\", $b / 1048576 }"
  else
    awk "BEGIN { printf \"%.1f KB\", $b / 1024 }"
  fi
}

failed=0

printf '%-12s %-12s %-12s %s\n' 'Bundle' 'Size' 'Budget' 'Status'
printf '%-12s %-12s %-12s %s\n' '------' '----' '------' '------'

for row in "${BUDGETS[@]}"; do
  read -r label dir glob budget <<< "$row"

  if [[ ! -d "$dir" ]]; then
    printf '%-12s %-12s %-12s %s\n' "$label" '—' "$(fmt_bytes "$budget")" 'SKIP (dir missing)'
    continue
  fi

  total=0
  while IFS= read -r f; do
    size=$(wc -c < "$f" | tr -d ' ')
    total=$((total + size))
  done < <(find "$dir" -maxdepth 1 -type f -name "$glob" 2>/dev/null)

  status='OK'
  if (( total > budget )); then
    status='FAIL'
    failed=1
  fi

  printf '%-12s %-12s %-12s %s\n' "$label" "$(fmt_bytes "$total")" "$(fmt_bytes "$budget")" "$status"
done

if (( failed )); then
  echo ''
  echo 'Bundle size budget exceeded. Either:'
  echo '  - find the regression and trim it'
  echo '  - intentionally raise the budget in scripts/check-bundle-sizes.sh'
  exit 1
fi

echo ''
echo 'All bundles within budget.'
