import { SqlError } from '@effect/sql/SqlError'
import { ingestJobs, KnowledgeDrizzle } from '@lily/knowledge-db'
import type { IngestJob, IngestJobStatus } from '@lily/shared/knowledge'
import { count, desc, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

type IngestJobRow = typeof ingestJobs.$inferSelect

const mapToIngestJob = (row: IngestJobRow): IngestJob => ({
  id: row.id,
  adapter: row.adapter,
  config: row.config,
  status: row.status,
  documentsFetched: row.documentsFetched,
  chunksCreated: row.chunksCreated,
  cursor: Option.getOrUndefined(Option.fromNullable(row.cursor)),
  error: Option.getOrUndefined(Option.fromNullable(row.error)),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export interface IIngestJobRepository {
  readonly create: (
    adapter: string,
    config: unknown
  ) => Effect.Effect<IngestJob, SqlError>
  readonly findById: (id: string) => Effect.Effect<IngestJob | null, SqlError>
  readonly findAll: () => Effect.Effect<IngestJob[], SqlError>
  readonly findPending: () => Effect.Effect<IngestJob[], SqlError>
  readonly updateStatus: (
    id: string,
    status: IngestJobStatus,
    counts?: { documentsFetched?: number; chunksCreated?: number }
  ) => Effect.Effect<IngestJob | null, SqlError>
  readonly updateError: (
    id: string,
    error: string
  ) => Effect.Effect<void, SqlError>
  readonly count: () => Effect.Effect<number, SqlError>
  readonly delete: (id: string) => Effect.Effect<boolean, SqlError>
}

export class IngestJobRepository extends Context.Tag('IngestJobRepository')<
  IngestJobRepository,
  IIngestJobRepository
>() {}

export const IngestJobRepositoryLive = Layer.effect(
  IngestJobRepository,
  Effect.gen(function* () {
    const db = yield* KnowledgeDrizzle

    return {
      create: Effect.fn('IngestJobRepository.create')(function* (
        adapter: string,
        config: unknown
      ) {
        const rows = yield* db
          .insert(ingestJobs)
          .values({ adapter, config })
          .returning()

        return yield* pipe(
          Array.head(rows),
          Option.match({
            onNone: () =>
              Effect.fail(
                new SqlError({
                  cause: new Error('INSERT into ingest_jobs returned no rows'),
                  message: 'INSERT into ingest_jobs returned no rows',
                })
              ),
            onSome: (row) => Effect.succeed(mapToIngestJob(row)),
          })
        )
      }),

      findById: Effect.fn('IngestJobRepository.findById')(function* (
        id: string
      ) {
        const rows = yield* db
          .select()
          .from(ingestJobs)
          .where(eq(ingestJobs.id, id))

        return pipe(
          Array.head(rows),
          Option.map(mapToIngestJob),
          Option.getOrNull
        )
      }),

      findAll: Effect.fn('IngestJobRepository.findAll')(function* () {
        const rows = yield* db
          .select()
          .from(ingestJobs)
          .orderBy(desc(ingestJobs.createdAt))

        return Array.map(rows, mapToIngestJob)
      }),

      findPending: Effect.fn('IngestJobRepository.findPending')(function* () {
        const rows = yield* db
          .select()
          .from(ingestJobs)
          .where(eq(ingestJobs.status, 'pending'))
          .orderBy(ingestJobs.createdAt)

        return Array.map(rows, mapToIngestJob)
      }),

      updateStatus: Effect.fn('IngestJobRepository.updateStatus')(function* (
        id: string,
        status: IngestJobStatus,
        counts?: { documentsFetched?: number; chunksCreated?: number }
      ) {
        const rows = yield* db
          .update(ingestJobs)
          .set({
            status,
            documentsFetched: counts?.documentsFetched,
            chunksCreated: counts?.chunksCreated,
          })
          .where(eq(ingestJobs.id, id))
          .returning()

        return pipe(
          Array.head(rows),
          Option.map(mapToIngestJob),
          Option.getOrNull
        )
      }),

      updateError: Effect.fn('IngestJobRepository.updateError')(function* (
        id: string,
        error: string
      ) {
        yield* db
          .update(ingestJobs)
          .set({ error, status: 'failed' })
          .where(eq(ingestJobs.id, id))
      }),

      count: Effect.fn('IngestJobRepository.count')(function* () {
        const result = yield* db.select({ value: count() }).from(ingestJobs)

        return pipe(
          Array.head(result),
          Option.map((r) => r.value),
          Option.getOrElse(() => 0)
        )
      }),

      delete: Effect.fn('IngestJobRepository.delete')(function* (id: string) {
        const rows = yield* db
          .delete(ingestJobs)
          .where(eq(ingestJobs.id, id))
          .returning()
        return Array.isNonEmptyArray(rows)
      }),
    }
  })
)
