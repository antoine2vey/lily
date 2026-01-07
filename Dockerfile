FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build the API
RUN bun run build

# Expose port
EXPOSE 3000

# Default command
CMD ["bun", "run", "dev"] 