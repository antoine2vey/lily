# @lily/db

The primary Postgres database for Lily. It holds the Drizzle schema, the SQL migrations, the migrator that applies them, and the bridge that runs Drizzle queries as Effect programs.

The api uses it for all domain data. mcp uses it for its OAuth tables and the `rate_limits` table. knowledge-db reuses its migrator, bridge and pool config for the separate knowledge database. The package has no server of its own.

## How it runs

- `src/schema/` declares the tables, enums and relations. `src/index.ts` exports `PgLive` and `DrizzleLive`, the layers the api and mcp provide.
- `drizzle/` holds the migrations. Each one is a hand-written `.sql` file.
- `src/migrator.ts` applies `drizzle/` in file name order and records each file in `__drizzle_migrations`. Production runs it on every deploy from `Dockerfile.prod`, then seeds the subscription tiers, then starts the api.
- `gated/` holds SQL that waits for a manual condition before it moves into `drizzle/`. [gated/README.md](gated/README.md) explains each file.

## Commands

Run them from the monorepo root. A command that reaches a database reads `DATABASE_URL` from `packages/db/.env`, which the [Quickstart](../../README.md#quickstart) links to the root `.env`.

| Command | What it does |
|---|---|
| `bun run --filter=@lily/db db:push` | Syncs a local database to the schema |
| `bun run --filter=@lily/db db:migrate:prod` | Applies `drizzle/` to `DATABASE_URL` with the production migrator |
| `bun run db:setup-test` | Applies `drizzle/` to the test database and seeds the tiers. Safe to rerun. |
| `bun run --filter=@lily/db db:studio` | Opens Drizzle Studio on `DATABASE_URL` |
| `bun run --filter=@lily/db test` | Runs the bridge tests against `TEST_DATABASE_URL`. They skip when it is unset. |
| `bun run --filter=@lily/db tsc` | Typechecks the package |
| `bun run --filter=@lily/db seed:admin --email=<email>` | Gives an existing user the admin role |
| `bun run --filter=@lily/db seed:tiers` | Upserts the free and paid subscription tiers |
| `bun run --filter=@lily/db seed:demo` | Seeds a demo account with plants and care history |
| `LOCALE=fr bun run --filter=@lily/db seed:demo-chat` | Reseeds the demo plant's chat in `en` or `fr` for the screenshot run |

`db:generate` and `db:migrate` call drizzle-kit, which reads the journal in `drizzle/meta/`. That journal stops at an old migration, so write new migrations by hand. [CLAUDE.md](CLAUDE.md) has the rules.

## Local setup

1. Start Postgres with `docker compose up -d postgres`. The test database is the `postgres-test` service.
2. Link the root `.env` into `packages/db` for `DATABASE_URL`, as the [Quickstart](../../README.md#quickstart) does. Put `DATABASE_URL_TEST` in `.env.test.local`, the file `db:setup-test` loads.
3. Build the database with `db:push` or with `db:migrate:prod`, and keep it on that one path. [CLAUDE.md](CLAUDE.md) explains why the two do not mix.
4. Run `bun run db:setup-test` for the test database.

The test database is built from `drizzle/`, so it has every trigger and index production has. A test database from the older `db:push` setup fails on the first migration. Drop it, create it again, and rerun `bun run db:setup-test`.

## Related docs

- [CLAUDE.md](CLAUDE.md) has the migration, schema and bridge rules.
- [CONTEXT.md](CONTEXT.md) names the columns that store the api's domain terms.
- [packages/api/CONTEXT.md](../api/CONTEXT.md) defines those terms.
- [packages/knowledge-db/README.md](../knowledge-db/README.md) covers the knowledge database.
