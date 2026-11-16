# packages/db

The primary Postgres database. This package holds the Drizzle schema in `src/schema/`, the hand-written SQL migrations in `drizzle/`, the migrator that applies them, and the bridge that turns Drizzle queries into Effects. The api reads and writes through it, mcp writes its OAuth tables and `rate_limits` through it, and knowledge-db reuses its bridge, pool config and migrator. Nothing runs it on its own. Production applies `drizzle/` and seeds the tiers from `Dockerfile.prod` before the api starts. drizzle-kit does not own the migrations here, so every migration is written by hand.

## Commands

| Command | What it does |
|---|---|
| `bun run --filter=@lily/db db:push` | Syncs a local database to the Drizzle schema. Read **Local database** first. |
| `bun run --filter=@lily/db db:migrate:prod` | Applies `drizzle/` to `DATABASE_URL` with `src/migrator.ts`, the runner production uses |
| `bun run db:setup-test` | Root script. Loads `.env.test.local`, applies `drizzle/` to `DATABASE_URL_TEST` and seeds the tiers. Safe to rerun. |
| `bun run --filter=@lily/db db:check-time-zones` | Runs `AT TIME ZONE` on `DATABASE_URL_TEST` for every zone Bun's `Intl` lists and every alias in the IANA `backward` file, and fails on any it rejects. It also fails when Bun and the database give a zone `Intl` lists a different UTC offset at any 6-hour step of this year and the next. CI runs it. Locally, prefix it with `ICU_TIMEZONE_FILES_DIR=$PWD/packages/db/icu-tzdata` to check the zone rules production uses. |
| `bun run --filter=@lily/db test` | The pool config tests, which need no database, and the bridge tests against `TEST_DATABASE_URL`, which skip when it is unset. |
| `bun run --filter=@lily/db tsc` | Typecheck |
| `bun run --filter=@lily/db lint` | Biome |
| `bun run --filter=@lily/db db:studio` | Drizzle Studio on `DATABASE_URL` |
| `bun run --filter=@lily/db seed:demo` | Seeds a demo account with plants and care history for screenshots |

`bun run --filter` runs the script in `packages/db`, where Bun reads `packages/db/.env`, the link to the root `.env` that the [Quickstart](../../README.md#quickstart) sets up. The root `db:setup-test` script passes `.env.test.local` with `--env-file` instead.

## Layout

- `src/schema/` holds one file per area, re-exported from `src/schema/index.ts`. Each table's `relations()` sits in the same file, apart from its `pgTable` call.
- `drizzle/` holds every migration. The migrator applies the `.sql` files in name order. `drizzle/meta/` is drizzle-kit's journal and snapshots. They stop at an old migration and nothing in production reads them.
- `gated/` holds SQL that waits for a condition a deploy cannot check. A file there does nothing until it moves into `drizzle/`. `gated/README.md` states each file's condition.
- `src/migrator.ts` is the runner for this package and for knowledge-db. Its header comment covers the lock, the one transaction per file and the `-- migrate:no-transaction` directive.
- `src/effect-drizzle.ts` is the bridge. `src/__tests__/effect-drizzle.test.ts` pins the behavior listed under **Bridge**.
- `src/pool-config.ts` reads the pool and session settings from the `DATABASE_*` variables in `.env.example`. knowledge-db calls it with the `KNOWLEDGE_DATABASE` prefix.

## Rules

### Migrations

- **Write each migration by hand** as a new file in `drizzle/`, and change the schema file to match. drizzle-kit's `db:generate` and `db:migrate` read `drizzle/meta/`, whose journal and snapshots stop at an old migration. Generate would diff against a stale snapshot, and migrate would skip every newer file.
- **Numbering.** The migrator records a file by its name without `.sql`. Give a new file the next unused number, and keep every existing name as it is, because production runs a renamed file again on the next deploy. The duplicate `0025_` prefix and the missing `0059_` are harmless and stay.
- **Migrations only go forward.** No file has a down step. To undo a schema change, write a new migration that reverses it. The migrator skips a recorded name without reading the file, so an edit to a merged migration never reaches a database that already applied it.
- **A migration merged to `main` reaches production on the next deploy**, before the new api starts. Never run `db:migrate:prod` against production by hand. [`docs/agents/releases.md`](../../docs/agents/releases.md) describes the deploy and what skips it.
- **The previous release keeps serving while a migration runs.** Write each migration so the code already running still works against it. A step that would break that code, such as a new `NOT NULL`, a dropped column or a removed enum value, goes in a later release, or in `gated/` when it waits on a condition.
- **Bound lock waits.** A migration that updates or alters a busy table starts with `SET LOCAL lock_timeout = '5s'` and a `--> statement-breakpoint`, as in `drizzle/0079_schedule_next_care_at_not_null.sql`. A statement waiting for a lock blocks every query queued behind it. With the timeout, the file gives up after five seconds, rolls back and stops the deploy, and the queued queries go on.
- **Build an index on a large table concurrently.** Put `-- migrate:no-transaction` on the first line, drop any INVALID index a failed build left, then run `CREATE INDEX CONCURRENTLY IF NOT EXISTS`. The migrator runs such a file one chunk at a time with no transaction, so each chunk must be safe to rerun. `drizzle/0076_reminder_occasion_unique.sql` is the pattern.
- **Index every foreign key column** in the migration that adds the key. Postgres does not index the referencing side, so a filter on the column and a delete of the parent row both scan the child table. Some older keys lack an index.
- **Some objects exist only in SQL.** The triggers `plants_creator_fallback` and `care_logs_actor_fallback` come from `drizzle/0064_canopy_actor_backfill_rerun.sql` and the Drizzle schema does not declare them. `packages/api/src/__tests__/integration/schema-parity.integration.test.ts` checks that they exist, that every file in `drizzle/` is recorded, and that the `notification_type` enum matches `NOTIFICATION_TOPICS`.
- **A new notification topic** needs a migration that appends it with `ALTER TYPE ... ADD VALUE`, in `NOTIFICATION_TOPICS` order. `src/schema/enums.ts` builds the enum from that list.

### Local database

- **One Postgres image.** `Dockerfile.postgres` at the repository root builds the database for production, CI and `docker-compose.yml`. Railway builds it from `.railway/railway.ts`. It adds `tzdata-legacy` to `postgres-ssl:17`, so Postgres accepts the IANA `backward` aliases that Bun lists, such as `Asia/Calcutta`. Change the image there and nowhere else.
- **Bun reads its zone rules from `icu-tzdata/`.** Bun's bundled ICU lags IANA by months, so it would put local midnight an hour away from where Postgres puts it in a zone that changed its rules recently. `Dockerfile.prod` and the CI integration job set `ICU_TIMEZONE_FILES_DIR` to this folder, which holds ICU's build of one IANA release. When `db:check-time-zones` reports that the database is newer, run `bash scripts/update-icu-tzdata.sh <release>` with the release Debian ships in `Dockerfile.postgres`.
- **Keep each database on one path.** `db:push` syncs a database to the Drizzle schema but creates none of the SQL-only objects. `db:migrate:prod` builds a fresh database the way production and `db:setup-test` do.
- **Never mix them on one database.** On a database `db:push` built, `db:migrate:prod` finds no record and replays from `0000`, which fails on the first type that exists. On a database the migrator built, `db:push` finds the migrator's `__drizzle_migrations` table, which the schema does not declare (`drizzle.config.ts` has no `tablesFilter`), and offers to drop it.
- **Test database.** `db:setup-test` builds it from `drizzle/`, so it has every trigger and index production has. A test database from the older `db:push` setup has no migration record and fails on the first file. Drop it, create it again and rerun `db:setup-test`.

### Schema

- **Primary keys.** A table whose rows have their own identity uses `uuid('id').primaryKey().defaultRandom()`. A table with one row per value of a natural key, such as an OAuth token or a RevenueCat event id, uses that column as its key. A table keyed by the pair it relates, such as a user and a plant, uses `primaryKey({ columns: [...] })`. `outbox` uses a `bigserial` id.
- **Timestamps.** Every timestamp column takes `{ withTimezone: true }`. `created_at` takes `.notNull().defaultNow()`. `updated_at` takes `.$onUpdate(() => new Date())` so every Drizzle update sets it. Tables without it, such as `users` and `rooms`, rely on each caller to set `updatedAt`.
- **Days are `date` columns.** A care day, due day or occasion is stored as a `date` (`care_logs.care_day`, `plant_care_schedules.due_day`, `notifications.occasion_day`), next to any instant the row also keeps. [packages/api/CONTEXT.md](../api/CONTEXT.md) defines these days.
- **Every foreign key states `onDelete`**, so the behavior on delete is a choice and not Postgres's default.
- **Enums.** Declare a Postgres enum with `pgEnum` in `src/schema/enums.ts`. A few older ones sit next to their tables in `src/schema/subscriptions.ts` and `src/schema/gift-codes.ts`.
- **Naming.** Tables and columns are snake_case in the database. TypeScript properties are camelCase.
- **One owner.** The checks `plants_one_owner` and `rooms_one_owner` require exactly one of `user_id` and `canopy_id`. A move between owners sets one and clears the other in the same update.

### Bridge

- **Queries are Effects.** Every Drizzle query is an `Effect<A, SqlError>` that runs on the ambient `SqlClient`, so `SqlClient.withTransaction` covers it. A duplicate key fails with a `SqlError` whose `reason._tag` is `UniqueViolation`.
- **`db.execute` returns `[{ rows }]`**, one array element around the driver result. Read it with `unwrapPgRows` from `packages/api/src/repositories/helpers/pagination.ts`. A raw `int8` decodes as `bigint`. `count()` and `::int` give a `number`.
- **A custom column type needs a codec.** The client reads results in binary, so a type with no codec in its `PgTypes` registry comes back garbled or fails with `PgTypesCodecError`. knowledge-db's `halfvec` codec is the worked example.

### Seeds

- **Tier limits live in three scripts.** `scripts/seed-tiers-prod.ts` upserts them on every deploy, so it decides production. `scripts/seed-subscription-tiers.ts` and `scripts/setup-test-db.ts` hold copies. Change all three together.
- **Reviewer accounts.** `seed:apple-reviewer` and `seed:android-reviewer` read the email from `APPLE_REVIEWER_EMAIL` and `ANDROID_REVIEWER_EMAIL`. The reviewer signs in through the `REVIEWER_EMAILS` allowlist, so the same email must be on it in that environment. Take it off the list once the review ends.
