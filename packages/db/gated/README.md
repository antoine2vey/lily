# Gated migrations

The migrator applies the files in `packages/db/drizzle` and no others, and production runs it on every deploy from `main`. A file in this folder does nothing where it is. Each one waits for a condition that a deploy cannot check. To apply a file, move it into `packages/db/drizzle` under the next unused number, in a release of its own, once its condition holds.

Never run one of these files by hand against production.

| File | What it does | Deletes rows |
| --- | --- | --- |
| `resync_stored_days.sql` | Sets a stored due day or care day back to the day of its instant, on rows where the two differ. Needed only if an older release wrote after the migrations ran. | No |
| `care_day_unique.sql` | Removes same-day duplicate care logs, then enforces one care per plant, care type and care day. | Yes |

Four files that waited here are applied. They are migrations `0079` to `0082` in `packages/db/drizzle`. `plant_care_schedules.next_care_at`, `plant_care_schedules.due_day` and `care_logs.care_day` are `NOT NULL`, and the `plant_health` type no longer has `NEEDS_ATTENTION`.

No release older than the one that added migrations `0070` to `0078` can run on this database any more. It inserts a schedule or a care log without its day, it sends a null `next_care_at` when it changes a frequency, and its health scheduler stores `NEEDS_ATTENTION`. Each of those writes now fails. Do not roll back to it.

## `resync_stored_days.sql`

### Why it is gated

Most deploys never need it. It repairs the rows a container of an older release wrote after migrations `0072` and `0074` ran.

Those migrations add the day columns `care_logs.care_day` and `plant_care_schedules.due_day`, and their release is the first whose code fills them. The release before it moves `next_care_at` when it records a care, ends a vacation, readjusts for the weather or accepts a care plan, and it moves `care_logs.date` when it edits a care. It does not know the day columns, so the stored day stays where it was. The new release then reads that plant as due on the old day.

### Read-only check to run first

The query reads and writes nothing. It counts the stored days that differ from the day of their instant:

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

A stored day stays put when its owner changes timezone, so a row differs when the owner, or the canopy, has changed timezone since the day was written. That is a behavior the release chose, and it needs no repair.

A row also differs when a container of an older release wrote it after the migrations ran. Run the query right after a rollout, and again after any rollback to an older release. A count above zero at that point comes from such writes, because no owner has had time to change timezone.

Later, a count far above the number of owners who changed timezone points at a writer that sets a day and an instant that do not match. Find it before you go on.

### The condition

The count of days that differ is above zero right after a rollout, or after a rollback to an older release has ended. No container of an older release is running.

### What it changes

It sets each differing `due_day` and `care_day` back to the day of its instant in the plant's care timezone. It deletes nothing.

It cannot tell a row an older container wrote from a row whose owner changed timezone since the day was stored. It resets both. For the second kind, the stored day moves once to the day the older release would have shown. Apply the file soon after the rollout so that few such rows exist.

No request to Reminders is needed. Delivery drops a care reminder planned for a day that is no longer the stored due day, and the daily reminder audit plans the new one once the plant is overdue, due today or due within two care days.

### What `lock_timeout` does

The file starts with `SET LOCAL lock_timeout = '5s'`. The migrator runs a file in one transaction, so the setting lasts for that file only.

Each update waits for a row another transaction holds, and the timeout bounds that wait. After five seconds the file fails, its transaction rolls back, the migrator records nothing and the deploy stops. The containers of the running release keep serving. Deploy again to retry.

### The code change that goes with it

None.

## `care_day_unique.sql`

This file deletes data, and the owner decides when it runs. Do not edit it, and apply it in a release of its own.

It keeps the earliest care log of each plant, care type and care day, points every care-plan step of a removed log at the kept one, and deletes the others. Last, it creates the unique index `care_logs_one_per_care_day`.

Its own header gives its condition. The number of duplicates has been read on production and accepted, and the Care store sets `care_day` on every insert path, seed scripts included. The second half holds from the release that contains migrations `0072` to `0077`.

The file was written while `care_day` was nullable. It still starts by filling `care_day` where it is null, and it still runs `SET NOT NULL` before it creates the index. Migration `0081` already made the column `NOT NULL`, so the first statement finds no row and the second changes nothing.
