# Stage 1: Install dependencies
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile --production

# Stage 2: Production
FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code (Bun runs TS directly)
COPY packages/api/src ./packages/api/src
COPY packages/api/package.json ./packages/api/
COPY packages/db/src ./packages/db/src
COPY packages/db/package.json ./packages/db/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/package.json ./packages/shared/
COPY package.json ./

EXPOSE 3000
WORKDIR /app/packages/api
CMD ["bun", "run", "src/index.ts"]
