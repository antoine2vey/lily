FROM oven/bun:1.4.3-debian AS builder

WORKDIR /app

COPY package.json bun.lock ./
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

COPY --from=builder /app/packages/web/dist/client /usr/share/nginx/html

COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

CMD sh -c "sed -i s/__PORT__/$PORT/g /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
