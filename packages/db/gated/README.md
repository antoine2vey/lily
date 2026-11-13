# Gated migrations

The migrator applies the files in `packages/db/drizzle` and no others, and production runs it on every deploy from `main`. A file in this folder does nothing where it is. Each one waits for a condition that a deploy cannot check. To apply a file, move it into `packages/db/drizzle` under the next unused number, in a release of its own, once its condition holds.

Never run one of these files by hand against production.

| File | What it does | Deletes rows |
| --- | --- | --- |
| `resync_stored_days.sql` | Sets a stored due day or care day back to the day of its instant, on rows where the two differ. Needed only if an older release wrote after the migrations ran. | No |
| `schedule_next_care_at_not_null.sql` | Fills `plant_care_schedules.next_care_at` where it is null, then makes the column `NOT NULL`. | No |
| `schedule_due_day_not_null.sql` | Fills `plant_care_schedules.due_day` where it is null, then makes the column `NOT NULL`. | No |
| `care_log_care_day_not_null.sql` | Fills `care_logs.care_day` where it is null, then makes the column `NOT NULL`. | No |
| `care_day_unique.sql` | Removes same-day duplicate care logs, then enforces one care per plant, care type and care day. | Yes |

## `schedule_due_day_not_null.sql` and `care_log_care_day_not_null.sql`

The two files are independent. Apply them together or one at a time, in either order.

### Why they are gated

Migrations `0072` and `0074` add the two day columns, and the same release is the first whose code fills them. While that release rolls out, containers of the previous release still serve requests. They insert schedules and care logs without a day. If the columns were already `NOT NULL`, each of those inserts would fail. So the columns stay nullable in that release, and the code reads a null day as the day of the row's instant (`storedDay` and `dueOnOrBefore` in `packages/api/src/contexts/care/stored-day.ts`).

### The condition

The release that contains migrations `0072` to `0077` is fully deployed, and no container of an older release is running. That covers the API, its schedulers and any one-off script. From then on every insert names its day column, because the Care store is the only writer of both tables.

### Read-only checks to run first

Run both queries on production after that release is deployed and before you move a file. They read and write nothing.

How many day columns are null:

```sql
SELECT
  (SELECT count(*) FROM plant_care_schedules WHERE due_day IS NULL) AS schedules_without_due_day,
  (SELECT count(*) FROM care_logs WHERE care_day IS NULL) AS logs_without_care_day;
```

Rows that a container of the previous release inserted during the rollout show up here. A count above zero is safe, because each file fills those rows before it forbids nulls. Run the query a second time a few minutes later. A count that grows means a process still inserts without the column, so the condition does not hold yet. Find that process before you go on.

How many stored days differ from the day of the instant:

```sql
SELECT
  (SELECT count(*)
     FROM plant_care_schedules s
     JOIN plants p ON p.id = s.plant_id
     LEFT JOIN canopies c ON c.id = p.canopy_id
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN pg_timezone_names ctz ON ctz.name = c.timezone
     LEFT JOIN pg_timezone_names utz ON utz.name = u.timezone
    WHERE s.due_day <> (s.next_care_at AT TIME ZONE coalesce(ctz.name, utz.name, 'UTC'))::date
  ) AS due_days_that_differ,
  (SELECT count(*)
     FROM care_logs cl
     JOIN plants p ON p.id = cl.plant_id
     LEFT JOIN canopies c ON c.id = p.canopy_id
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN pg_timezone_names ctz ON ctz.name = c.timezone
     LEFT JOIN pg_timezone_names utz ON utz.name = u.timezone
    WHERE cl.care_day <> (cl.date AT TIME ZONE coalesce(ctz.name, utz.name, 'UTC'))::date
  ) AS care_days_that_differ;
```

This count does not block the files. It measures a behavior the release chose. A stored day stays put when its owner changes timezone, so a row differs when the owner, or the canopy, has changed timezone since the day was written. `0072` and `0074` fill the columns with this same expression, so both counts are zero when the migrations end.

A row also differs when a container of the previous release wrote it after the migrations ran. That release moves `next_care_at` when it records a care, ends a vacation, readjusts for the weather or accepts a care plan, and it moves `care_logs.date` when it edits a care. It does not know the day columns, so the stored day stays where it was. The new release then reads that plant as due on the old day. Run this query right after the rollout, and again after any rollback to the previous release. A count above zero at that point comes from such writes, because no owner has had time to change timezone. Apply `resync_stored_days.sql` in the next release. See its section below.

Later, a count far above the number of owners who changed timezone points at a writer that sets a day and an instant that do not match. Find it before you go on.

### What `lock_timeout` does

Each file starts with `SET LOCAL lock_timeout = '5s'`. The migrator runs a file in one transaction, so the setting lasts for that file only.

`SET NOT NULL` needs an `ACCESS EXCLUSIVE` lock on the table. While the migration waits for that lock, every new query on the table waits behind it. The timeout bounds that wait. After five seconds the file fails, its transaction rolls back, the migrator records nothing and the deploy stops. The containers of the running release keep serving. Deploy again to retry.

The timeout does not bound the work done under the lock. Once the lock is granted, Postgres scans the whole table to check that no row is null, and every query on the table waits until the scan ends and the transaction commits. The scan takes as long as one sequential read of the table. Look at the size of `care_logs`, the larger of the two, before you apply its file.

### The code change that goes with them

Ship it in the release that moves the files, or in the next one. The running release already writes both columns, so it keeps working once they are `NOT NULL`.

1. In `packages/db/src/schema/care-schedules.ts`, write `date('due_day').notNull()`. In `packages/db/src/schema/plant-history.ts`, write `date('care_day').notNull()`. Remove "Null on rows old code wrote" from both comments.
2. Run `bun run tsc`. Drizzle now requires both columns on insert, so the compiler flags any insert that leaves one out.
3. Delete the null branch. Remove `storedDay` and the `isNull` arm of `dueOnOrBefore` from `packages/api/src/contexts/care/stored-day.ts`, and read the column with `CareDay.make` where `storedDay` was called. Remove `undatedBefore` from `DuePrune` and the slack constants above `duePrune` in `packages/api/src/contexts/care/care-reads.ts`. Type `StoredSchedule.dueDay` as a `CareDay`.
4. Delete the tests that seed a row without a day, because that row can no longer exist. In the integration suite they are the "no stored due day" half of `care-reads.integration.test.ts` and the `unstored` plant of its "stays put" test, the two "without a stored" tests in `care-record.integration.test.ts`, and the "where no due day is stored" test in `reminder-triggers.integration.test.ts`. On a database where both columns are `NOT NULL`, the integration suite fails on these 11 tests and on no other. In the unit suite they are the "row without a stored due day" test in `plant-care.test.ts` and the `dueAt < prune.undatedBefore` half of the `duePrune` check in `care-reads.test.ts`.

## `resync_stored_days.sql`

### Why it is gated

Most deploys never need it. It repairs the rows a container of the previous release wrote after migrations `0072` and `0074` ran. The section above explains how those rows get a stored day that no longer matches its instant, and gives the read-only query that counts them.

### The condition

The count of days that differ is above zero right after a rollout, or after a rollback to the previous release has ended. No container of an older release is running.

### What it changes

It sets each differing `due_day` and `care_day` back to the day of its instant in the plant's care timezone. It leaves a null day null. It deletes nothing.

It cannot tell a row an older container wrote from a row whose owner changed timezone since the day was stored. It resets both. For the second kind, the stored day moves once to the day the previous release would have shown. Apply the file soon after the rollout so that few such rows exist.

No request to Reminders is needed. Delivery drops a care reminder planned for a day that is no longer the stored due day, and the daily reminder audit plans the new one once the plant is overdue, due today or due within two care days.

### The code change that goes with it

None.

## `schedule_next_care_at_not_null.sql`

### Why it is gated

Migration `0073` gives every schedule a due instant. It does not make the column `NOT NULL`, because the release before it changes a frequency with `INSERT ... VALUES (..., next_care_at NULL) ON CONFLICT DO UPDATE`. Postgres checks `NOT NULL` on the inserted values before it looks for the conflict, so the statement fails even when the row exists and only the frequency would change. With the column `NOT NULL`, every frequency change served by a container of that release would answer 500 during the rollout, and for as long as a rollback to that release lasts.

That release never stores a null: a new row gets the current instant, and the conflict branch leaves the column alone. So the column holds no null after `0073`, with or without the constraint. The Drizzle schema already types it `.notNull()`, and the Care store sets it on every insert.

### The condition

The release that contains migration `0073` is fully deployed, no container of an older release is running, and you no longer intend to roll back to an older release.

### Read-only check to run first

```sql
SELECT count(*) AS schedules_without_a_due_instant
  FROM plant_care_schedules
 WHERE next_care_at IS NULL;
```

Zero is expected. A count above zero is safe for the file, which fills those rows first, but it means a writer stores a null. Find it before you go on.

### The code change that goes with it

None. The schema and the code already treat the column as never null. `lock_timeout` works as described above.

## `care_day_unique.sql`

This file deletes data, and the owner decides when it runs. Do not edit it, and do not apply it as part of the two files above.

It fills `care_day` where it is null. It then keeps the earliest care log of each plant, care type and care day, points every care-plan step of a removed log at the kept one, and deletes the others. Last, it makes `care_day` `NOT NULL` and creates the unique index `care_logs_one_per_care_day`.

Its own header gives its condition. The number of duplicates has been read on production and accepted, and the Care store sets `care_day` on every insert path, seed scripts included. The second half holds from the release that contains migrations `0072` to `0077`.

It can run before or after `care_log_care_day_not_null.sql`. Run after it, its own `SET NOT NULL` changes nothing.
