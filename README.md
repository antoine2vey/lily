# Lily Monorepo

A TypeScript monorepo built with Bun, featuring Effect for functional programming, Prisma for database management, and Biome for linting.

## Structure

```
lily/
├── packages/
│   ├── api/          # Node.js API with Effect RPC + Prisma
│   └── shared/       # Shared deps
│   └── app/          # React Native app (coming soon)
├── docker-compose.yml # PostgreSQL database
├── Dockerfile        # API container
├── package.json      # Root workspace configuration
├── biome.json        # Biome linting configuration
├── tsconfig.json     # TypeScript configuration
└── README.md         # This file
```

## Prerequisites

- Bun 1.0+
- Docker & Docker Compose
- PostgreSQL (via Docker)

## Quick Start

1. **Start PostgreSQL:**

   ```bash
   docker-compose up -d postgres
   ```

2. **Install dependencies:**

   ```bash
   bun install
   ```

3. **Setup database:**

   ```bash
   cd packages/api
   bunx prisma generate
   bunx prisma db push
   ```

4. **Start development:**
   ```bash
   bun run dev
   ```

## Environment Variables

The app uses the following environment variables:

- `DATABASE_URL` - PostgreSQL connection string
  - **Local Docker**: `postgresql://lily:lily123@localhost:5432/lily`
  - **Docker Container**: `postgresql://lily:lily123@postgres:5432/lily`

## Available Scripts

- `bun run build` - Build all packages
- `bun run dev` - Start development mode for API
- `bun run test` - Run tests across all packages
- `bun run lint` - Lint all packages with Biome
- `bun run lint:fix` - Fix linting issues automatically
- `bun run clean` - Clean build artifacts

## API Endpoints

The API runs on `http://localhost:3000` with the following RPC endpoints:

- `POST /rpc` - RPC endpoint for all operations
- `GET /rpc` - RPC endpoint for streaming operations

## Database

- **Type:** PostgreSQL
- **Host:** localhost:5432
- **Database:** lily
- **User:** lily
- **Password:** lily123

## Tech Stack

- **Package Manager:** Bun 1.0+
- **Language:** TypeScript 5.3+
- **Linting:** Biome
- **Functional Programming:** Effect
- **Database:** PostgreSQL + Prisma
- **API Framework:** Effect RPC with Bun HTTP server
- **Testing:** Vitest
- **Containerization:** Docker & Docker Compose

## Development

### Adding a new package

1. Create a new directory in `packages/`
2. Add a `package.json` with the workspace name
3. Run `bun install` to link the workspace

### Database migrations

```bash
cd packages/api
bunx prisma db push    # Push schema changes
bunx prisma generate   # Generate client
bunx prisma studio     # Open Prisma Studio
```

## Contributing

1. Follow the TypeScript strict configuration
2. Use Biome for linting and formatting
3. Write Effect-based functional code
4. Add tests for new features
5. Use Prisma for database operations

## License

MIT
