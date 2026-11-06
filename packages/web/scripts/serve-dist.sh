#!/bin/sh
# usage: scripts/serve-dist.sh [port]   serves dist/client with the production nginx.conf in Docker
set -e
cd "$(dirname "$0")/.."
PORT=${1:-8088}
docker rm -f lily-web-dist >/dev/null 2>&1 || true
sed "s/__PORT__/80/" nginx.conf > dist/nginx.conf
docker run -d --name lily-web-dist -p "$PORT:80" \
  -v "$PWD/dist/client:/usr/share/nginx/html:ro" \
  -v "$PWD/dist/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$PWD/dist/redirects.map:/etc/nginx/redirects.map:ro" nginx:alpine >/dev/null
echo "http://127.0.0.1:$PORT"
