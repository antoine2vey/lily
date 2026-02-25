import { ingestJobs, KnowledgeDrizzle } from '@lily/knowledge-db'
import type { IngestJob, IngestJobStatus } from '@lily/shared/knowledge'
import { count, desc, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { UnknownException } from 'effect/Cause'

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
  ) => Effect.Effect<IngestJob, UnknownException>
  readonly findById: (
    id: string
  ) => Effect.Effect<IngestJob | null, UnknownException>
  readonly findAll: () => Effect.Effect<IngestJob[], UnknownException>
  readonly findPending: () => Effect.Effect<IngestJob[], UnknownException>
  readonly updateStatus: (
    id: string,
    status: IngestJobStatus,
    counts?: { documentsFetched?: number; chunksCreated?: number }
  ) => Effect.Effect<IngestJob | null, UnknownException>
  readonly updateError: (
    id: string,
    error: string
  ) => Effect.Effect<void, UnknownException>
  readonly count: () => Effect.Effect<number, UnknownException>
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
      create: (adapter: string, config: unknown) =>
        Effect.gen(function* () {
          const rows = (yield* Effect.tryPromise(() =>
            db.insert(ingestJobs).values({ adapter, config }).returning()
          )) as IngestJobRow[]

          return yield* pipe(
            Array.head(rows),
            Option.match({
              onNone: () =>
                Effect.fail(
                  new UnknownException(
                    new Error('INSERT into ingest_jobs returned no rows')
                  )
                ),
              onSome: (row) => Effect.succeed(mapToIngestJob(row)),
            })
          )
        }).pipe(Effect.withSpan('IngestJobRepository.create')),

      findById: (id: string) =>
        Effect.gen(function* () {
          const rows = (yield* Effect.tryPromise(() =>
            db.select().from(ingestJobs).where(eq(ingestJobs.id, id))
          )) as IngestJobRow[]

          return pipe(
            Array.head(rows),
            Option.map(mapToIngestJob),
            Option.getOrNull
          )
        }).pipe(Effect.withSpan('IngestJobRepository.findById')),

      findAll: () =>
        Effect.gen(function* () {
          const rows = (yield* Effect.tryPromise(() =>
            db.select().from(ingestJobs).orderBy(desc(ingestJobs.createdAt))
          )) as IngestJobRow[]

          return Array.map(rows, mapToIngestJob)
        }).pipe(Effect.withSpan('IngestJobRepository.findAll')),

      findPending: () =>
        Effect.gen(function* () {
          const rows = (yield* Effect.tryPromise(() =>
            db
              .select()
              .from(ingestJobs)
              .where(eq(ingestJobs.status, 'pending'))
              .orderBy(ingestJobs.createdAt)
          )) as IngestJobRow[]

          return Array.map(rows, mapToIngestJob)
        }).pipe(Effect.withSpan('IngestJobRepository.findPending')),

      updateStatus: (
        id: string,
        status: IngestJob['status'],
        counts?: { documentsFetched?: number; chunksCreated?: number }
      ) =>
        Effect.gen(function* () {
          const rows = (yield* Effect.tryPromise(() =>
            db
              .update(ingestJobs)
              .set({
                status,
                documentsFetched: counts?.documentsFetched,
                chunksCreated: counts?.chunksCreated,
              })
              .where(eq(ingestJobs.id, id))
              .returning()
          )) as IngestJobRow[]

          return pipe(
            Array.head(rows),
            Option.map(mapToIngestJob),
            Option.getOrNull
          )
        }).pipe(Effect.withSpan('IngestJobRepository.updateStatus')),

      updateError: (id: string, error: string) =>
        Effect.gen(function* () {
          yield* Effect.tryPromise(() =>
            db
              .update(ingestJobs)
              .set({ error, status: 'failed' })
              .where(eq(ingestJobs.id, id))
          )
        }).pipe(Effect.withSpan('IngestJobRepository.updateError')),

      count: () =>
        Effect.gen(function* () {
          const result = (yield* Effect.tryPromise(() =>
            db.select({ value: count() }).from(ingestJobs)
          )) as { value: number }[]

          return pipe(
            Array.head(result),
            Option.map((r) => r.value),
            Option.getOrElse(() => 0)
          )
        }).pipe(Effect.withSpan('IngestJobRepository.count')),
    }
  })
)
