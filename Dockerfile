FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files for all workspaces
COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build shared and db packages first, then api
RUN cd packages/shared && bun run build
RUN cd packages/db && bun run build
RUN cd packages/api && bun run build

# Expose port
EXPOSE 3000

# Default command (run from api package)
WORKDIR /app/packages/api
CMD ["bun", "run", "dev"] 