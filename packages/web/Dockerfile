FROM oven/bun:1.3.8-debian AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY patches ./patches
COPY packages/admin/package.json ./packages/admin/
COPY packages/api/package.json ./packages/api/
COPY packages/app/package.json ./packages/app/
COPY packages/db/package.json ./packages/db/
COPY packages/knowledge-db/package.json ./packages/knowledge-db/
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/plant-scanner/package.json ./packages/plant-scanner/
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/

RUN bun install --ignore-scripts

COPY tsconfig.json ./
COPY packages/web ./packages/web

WORKDIR /app/packages/web
RUN bun run build

FROM nginx:alpine AS runner

COPY --from=builder /app/packages/web/out /usr/share/nginx/html

RUN printf 'server {\n  listen __PORT__;\n  root /usr/share/nginx/html;\n  index index.html;\n  absolute_redirect off;\n\n  add_header X-Content-Type-Options "nosniff" always;\n  add_header X-Frame-Options "DENY" always;\n  add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;\n\n  location = / {\n    try_files /index.html =404;\n  }\n\n  location / {\n    try_files $uri $uri.html $uri/ =404;\n  }\n}\n' \
    > /etc/nginx/conf.d/default.conf

CMD sh -c "sed -i s/__PORT__/$PORT/g /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
