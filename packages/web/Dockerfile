FROM oven/bun:1.3.8-debian AS builder

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .
RUN bun run build

FROM nginx:alpine AS runner

COPY --from=builder /app/out /usr/share/nginx/html

RUN printf 'server {\n  listen __PORT__;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / {\n    try_files $uri $uri.html $uri/ =404;\n  }\n}\n' \
    > /etc/nginx/conf.d/default.conf

CMD sh -c "sed -i s/__PORT__/$PORT/g /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
