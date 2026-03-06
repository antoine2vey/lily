FROM oven/bun:1.3.8-debian AS builder

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .
RUN bun run build

FROM oven/bun:1.3.8-debian AS runner

WORKDIR /app
COPY --from=builder /app/out ./out

EXPOSE 3000
CMD bunx http-server out -p $PORT -a 0.0.0.0 --proxy http://0.0.0.0:$PORT?
