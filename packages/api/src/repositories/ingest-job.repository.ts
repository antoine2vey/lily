import { ingestJobs, KnowledgeDrizzle } from '@lily/knowledge-db'
import type { IngestJob } from '@lily/shared/knowledge'
import { and, count, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'

type IngestJobRow = typeof ingestJobs.$inferSelect

const mapToIngestJob = (row: IngestJobRow): IngestJob => ({
  id: row.id,
  adapter: row.adapter,
  config: row.config,
  status: row.status,
  documentsFetched: row.documentsFetched,
  chunksCreated: row.chunksCreated,
  cursor: Option.getOrUndefined(Option.fromNullishOr(row.cursor)),
  error: Option.getOrUndefined(Option.fromNullishOr(row.error)),
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
  /**
   * Takes the oldest pending job for this worker: one UPDATE that flips it
   * to in_progress and stamps claimed_at. `FOR UPDATE SKIP LOCKED` lets two
   * workers claim at once without taking the same job. Null when the queue
   * is empty.
   */
  readonly claimNext: () => Effect.Effect<IngestJob | null, SqlError>
  /**
   * Puts in_progress jobs whose claim is older than `before` (or that were
   * never stamped, from before claims existed) back to pending. Returns how
   * many were released.
   */
  readonly releaseStaleClaims: (before: Date) => Effect.Effect<number, SqlError>
  /** Writes the running counts and refreshes the claim. */
  readonly recordProgress: (
    id: string,
    counts: { documentsFetched: number; chunksCreated: number }
  ) => Effect.Effect<void, SqlError>
  readonly complete: (
    id: string,
    counts: { documentsFetched: number; chunksCreated: number }
  ) => Effect.Effect<void, SqlError>
  readonly updateError: (
    id: string,
    error: string
  ) => Effect.Effect<void, SqlError>
  readonly count: () => Effect.Effect<number, SqlError>
  readonly delete: (id: string) => Effect.Effect<boolean, SqlError>
}

export class IngestJobRepository extends Context.Service<
  IngestJobRepository,
  IIngestJobRepository
>()('IngestJobRepository') {}

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
                  reason: new UnknownError({
                    cause: new Error(
                      'INSERT into ingest_jobs returned no rows'
                    ),
                    message: 'INSERT into ingest_jobs returned no rows',
                  }),
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

      claimNext: Effect.fn('IngestJobRepository.claimNext')(function* () {
        const rows = yield* db
          .update(ingestJobs)
          .set({ status: 'in_progress', claimedAt: sql`now()` })
          .where(
            eq(
              ingestJobs.id,
              sql`(SELECT ${ingestJobs.id} FROM ${ingestJobs} WHERE ${ingestJobs.status} = 'pending' ORDER BY ${ingestJobs.createdAt} LIMIT 1 FOR UPDATE SKIP LOCKED)`
            )
          )
          .returning()

        return pipe(
          Array.head(rows),
          Option.map(mapToIngestJob),
          Option.getOrNull
        )
      }),

      releaseStaleClaims: Effect.fn('IngestJobRepository.releaseStaleClaims')(
        function* (before: Date) {
          const rows = yield* db
            .update(ingestJobs)
            .set({ status: 'pending', claimedAt: null })
            .where(
              and(
                eq(ingestJobs.status, 'in_progress'),
                or(
                  isNull(ingestJobs.claimedAt),
                  lt(ingestJobs.claimedAt, before)
                )
              )
            )
            .returning({ id: ingestJobs.id })

          return rows.length
        }
      ),

      recordProgress: Effect.fn('IngestJobRepository.recordProgress')(
        function* (id, counts) {
          yield* db
            .update(ingestJobs)
            .set({
              documentsFetched: counts.documentsFetched,
              chunksCreated: counts.chunksCreated,
              claimedAt: sql`now()`,
            })
            .where(eq(ingestJobs.id, id))
        }
      ),

      complete: Effect.fn('IngestJobRepository.complete')(
        function* (id, counts) {
          yield* db
            .update(ingestJobs)
            .set({
              status: 'completed',
              documentsFetched: counts.documentsFetched,
              chunksCreated: counts.chunksCreated,
            })
            .where(eq(ingestJobs.id, id))
        }
      ),

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
        return Array.isArrayNonEmpty(rows)
      }),
    }
  })
)
