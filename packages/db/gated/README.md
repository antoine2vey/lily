# Gated migrations

The migrator applies the files in `packages/db/drizzle` and no others, and production runs it on every deploy from `main`. A file in this folder does nothing where it is. Each one waits for a condition that a deploy cannot check. To apply a file, move it into `packages/db/drizzle` under the next unused number, in a release of its own, once its condition holds.

Never run one of these files by hand against production.

No file waits here now.

Five files that waited here are applied. They are migrations `0079` to `0083` in `packages/db/drizzle`. `plant_care_schedules.next_care_at`, `plant_care_schedules.due_day` and `care_logs.care_day` are `NOT NULL`, and the `plant_health` type no longer has `NEEDS_ATTENTION`. The unique index `care_logs_one_per_care_day` allows one care log per plant, care type and care day. Migration `0083` removed the same-day duplicates that existed before it and kept the earliest log of each group.

No release older than the one that added migrations `0070` to `0078` can run on this database any more. It inserts a schedule or a care log without its day, it sends a null `next_care_at` when it changes a frequency, and its health scheduler stores `NEEDS_ATTENTION`. Each of those writes now fails. Do not roll back to it.
