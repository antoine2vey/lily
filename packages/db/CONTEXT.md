# DB domain language

The vocabulary of the primary database package. It covers how migrations reach a database, and which columns store the domain concepts the api defines. The domain terms themselves belong to [packages/api/CONTEXT.md](../api/CONTEXT.md).

## Migrations

| Term | Meaning | Avoid |
|---|---|---|
| **Migration** | One hand-written `.sql` file in `drizzle/`. The migrator applies it once, in file name order, in one transaction with its record. | "generated migration" |
| **Migration record** | A row of `__drizzle_migrations` whose `hash` is a migration's file name without `.sql`. The migrator keeps it in the public schema. drizzle-kit keeps its own records in `drizzle.__drizzle_migrations`. | "hash" meaning a content hash, which is what drizzle-kit stores |
| **No-transaction migration** | A migration whose first line is `-- migrate:no-transaction`. The migrator runs it one `--> statement-breakpoint` chunk at a time, outside a transaction, so every chunk is written to be rerun. | |
| **Migration lock** | The session advisory lock the migrator holds for its whole run. A second container waits on it, then skips the files the first one recorded. knowledge-db's migrator uses the same key, which is safe because an advisory lock belongs to one database. | |
| **Gated migration** | A SQL file in `gated/` that waits for a condition a deploy cannot check. It changes nothing until someone moves it into `drizzle/`. | |

## Stored domain terms

[packages/api/CONTEXT.md](../api/CONTEXT.md) defines each of these terms. This table names the columns that store them.

| Term | Meaning | Avoid |
|---|---|---|
| **Owner** | `user_id` or `canopy_id` on `plants` and `rooms`. The checks `plants_one_owner` and `rooms_one_owner` require exactly one of them. | |
| **Living plant** | A `plants` row whose `died_at` is null. The partial indexes `plants_user_id_living_idx` and `plants_canopy_id_living_idx` cover living plants only. | |
| **Care day** | `care_logs.care_day`, a `date`. The unique index `care_logs_one_per_care_day` allows one care per plant, care type and care day. | `care_logs.date`, which is the instant the care was logged |
| **Due day** | `plant_care_schedules.due_day`, a `date`. | `next_care_at`, which is an instant |
| **Occasion** | `notifications.occasion_day`, a `date`. On a `daily_tip` row it is the user's local day, and the unique index `notifications_daily_tip_day_unique` allows one tip per user and day. Tips recorded before migration `0096` have none. | |
| **Sharer** | `plants.created_by_user_id`. The trigger `plants_creator_fallback` sets it to `user_id` when an insert leaves it null. | |

## Relationships

- **api** owns every domain term above and is the only writer of domain data. It reads and writes through `DrizzleLive`. See [packages/api/CONTEXT.md](../api/CONTEXT.md).
- **shared** owns `NOTIFICATION_TOPICS`, the list `src/schema/enums.ts` turns into the `notification_type` enum. See [packages/shared/CONTEXT.md](../shared/CONTEXT.md).
- **mcp** writes its OAuth tables and `rate_limits` through `DrizzleLive` and calls the api over HTTP for everything else. See [packages/mcp/CONTEXT.md](../mcp/CONTEXT.md).
- **knowledge-db** reuses the migrator, the bridge in `src/effect-drizzle.ts` and the pool config for its own database. See [packages/knowledge-db/CONTEXT.md](../knowledge-db/CONTEXT.md).
