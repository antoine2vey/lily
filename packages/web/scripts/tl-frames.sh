#!/bin/sh
# usage: scripts/tl-frames.sh <clip.mp4> public/tl [width:crf...]   (writes <out-dir>/<width>/001.avif..; default 1920:44 960:48)
# Frames are encoded one ffmpeg call each: the image2 muxer writes .avif files Chrome refuses to decode.
# Each encode retries because libaom aborts (SIGABRT) now and then under parallel load.
set -e
SRC="$1"; OUT="$2"; shift 2; FPS=12
[ $# -gt 0 ] || set -- 1920:44 960:48
for SPEC in "$@"; do
  W=${SPEC%%:*}; CRF=${SPEC#*:}
  TMP=$(mktemp -d "${TMPDIR:-/tmp}/tlpng.XXXX")
  rm -rf "$OUT/$W"; mkdir -p "$OUT/$W"
  ffmpeg -v error -i "$SRC" -an -vf "fps=$FPS,scale=$W:-2:flags=lanczos" "$TMP/%03d.png"
  export TMP OUT W CRF
  ls "$TMP" | sed 's/\.png$//' | xargs -P 6 -n 1 sh -c 'for t in 1 2 3; do ffmpeg -v error -y -i "$TMP/$1.png" -c:v libaom-av1 -pix_fmt yuv420p -still-picture 1 -crf $CRF -cpu-used 6 "$OUT/$W/$1.avif" 2>/dev/null && exit 0; done; exit 1' _
  rm -rf "$TMP"
  echo "w=$W crf=$CRF frames=$(ls "$OUT/$W" | wc -l | tr -d ' ') size=$(du -sk "$OUT/$W" | cut -f1)KB"
done
