#!/usr/bin/env bash
# Replaces the time zone data the api's ICU reads (ICU_TIMEZONE_FILES_DIR in
# Dockerfile.prod and in CI) with ICU's build of one IANA tzdata release.
# Usage: bash scripts/update-icu-tzdata.sh 2026f

set -euo pipefail

release=${1:?usage: bash scripts/update-icu-tzdata.sh <IANA release, such as 2026f>}
dir="$(cd "$(dirname "$0")/.." && pwd)/packages/db/icu-tzdata"
# 44 is the resource format every ICU since 4.4 reads. le is little-endian, as
# on x86-64 and arm64.
base="https://raw.githubusercontent.com/unicode-org/icu-data/main/tzdata/icunew/$release/44/le"

staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
for file in zoneinfo64 metaZones timezoneTypes windowsZones; do
  curl -fsSL -o "$staging/$file.res" "$base/$file.res"
done

mkdir -p "$dir"
mv "$staging"/*.res "$dir"/
echo "ICU time zone data $release written to $dir"
