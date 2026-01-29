# Contributing to Lily

Development setup and workflow for the Lily monorepo.

## Quick Reference

```bash
bun run build      # Build all packages (turbo cached)
bun run lint       # Lint all packages
bun run lint:fix   # Auto-fix lint issues
bun run tsc        # Type check all packages
bun run test       # Run all tests
bun run dev        # Start development servers
```

## Development Workflow

```bash
# 1. Start infrastructure (postgres, redis only - API runs locally)
docker compose up -d postgres redis

# 2. Run API locally with hot reload
bun run dev

# 3. Type check
bun run tsc
```

## Docker Infrastructure

Docker is used for **infrastructure only** (postgres, redis). The API runs locally via `bun run dev` for faster iteration.

| Service | Port | Description |
|---------|------|-------------|
| postgres | 5432 | Development database |
| postgres-test | 5433 | Test database |
| redis | 6379 | Caching/session storage |

**Note:** The `api` service in docker-compose.yml is optional and only used for production-like testing.

### Docker Commands

```bash
docker compose up -d postgres redis     # Start only infrastructure services
docker compose down                     # Stop all services
docker compose down -v                  # Stop and remove volumes
docker compose ps                       # Show service status
```

## Database

### Credentials

- **User**: `lily`
- **Password**: `lily123`
- **Database**: `lily` (dev) / `lily_test` (test)

### Commands

```bash
docker compose exec postgres psql -U lily -d lily   # Connect to database
bun run db:generate                     # Generate Drizzle migrations
bun run db:push                         # Push schema to database
bun run db:migrate                      # Run pending migrations
bun run db:studio                       # Open Drizzle Studio
```

## Testing

```bash
docker compose up -d postgres-test      # Start test database
bun run test                            # Run all tests
bun run test:integration                # Run integration tests
```

## Build

```bash
bun run build                           # Build all packages (Turborepo cached)
```

## Linting

```bash
bun run lint                            # Check all packages
bun run lint:fix                        # Auto-fix issues
```
