#!/usr/bin/env bash
# Replaces the time zone data the api's ICU reads (ICU_TIMEZONE_FILES_DIR in
# Dockerfile.prod and in CI) with ICU's build of one IANA tzdata release, and
# sets TZDATA_RELEASE in Dockerfile.postgres to the same release.
# Usage: bash scripts/update-icu-tzdata.sh 2026f
#
# Each release is pinned below to the unicode-org/icu-data commit that added it
# and to the sha256 of each file. To add a release, find that commit with
#   gh api 'repos/unicode-org/icu-data/commits?path=tzdata/icunew/<release>'
# and run the script with ICU_DATA_COMMIT set to it. It fails, printing the
# hashes of what it downloaded, for you to add as a new case.

set -euo pipefail

release=${1:?usage: bash scripts/update-icu-tzdata.sh <IANA release, such as 2026f>}
root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/packages/db/icu-tzdata"

case "$release" in
  2026f)
    commit=6eac2f4d349d9f4a0825103bb41845d8e5ab7add
    sums="cc9d283bb2797813a17c00d80c2a86d27bc80da5e1cd24da846e8b4af6dbd860  metaZones.res
5e77ce5afb7374a36cbe3be197d0a6deaa919e6f672c2a372f7a9d91b7f8534f  timezoneTypes.res
377691d021bbdd7012806d8188412d13e587a76b64ecc7b79fec4dc36a419deb  windowsZones.res
d9382726ee8a499514310e63a9e97f1dbdd7fc2db328e1a785dde05f2afbb7e6  zoneinfo64.res"
    ;;
  *)
    commit=${ICU_DATA_COMMIT:?no checksums are pinned for $release. Set ICU_DATA_COMMIT to the icu-data commit that added it.}
    sums=""
    ;;
esac

# 44 is the resource format every ICU since 4.4 reads. le is little-endian, as
# on x86-64 and arm64.
base="https://raw.githubusercontent.com/unicode-org/icu-data/$commit/tzdata/icunew/$release/44/le"

staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
files=(metaZones.res timezoneTypes.res windowsZones.res zoneinfo64.res)
for file in "${files[@]}"; do
  curl -fsSL -o "$staging/$file" "$base/$file"
done

if [ -z "$sums" ]; then
  echo "Downloaded $release from icu-data $commit. Check these hashes and add them as a case for $release:" >&2
  (cd "$staging" && shasum -a 256 "${files[@]}") >&2
  exit 1
fi
if ! (cd "$staging" && echo "$sums" | shasum -a 256 -c --quiet -); then
  echo "The files for $release from icu-data $commit do not match their pinned sha256." >&2
  exit 1
fi

mkdir -p "$dir"
mv "$staging"/*.res "$dir"/
sed -i.bak "s/^ARG TZDATA_RELEASE=.*/ARG TZDATA_RELEASE=$release/" "$root/Dockerfile.postgres"
rm "$root/Dockerfile.postgres.bak"
echo "ICU time zone data $release written to $dir, and Dockerfile.postgres set to $release"
