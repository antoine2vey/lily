import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  claimsMigration,
  knowledgeTables,
} from '@lily/api/__tests__/integration/knowledge-tables'
import {
  IngestJobRepository,
  IngestJobRepositoryLive,
} from '@lily/api/repositories/ingest-job.repository'
import {
  RawDocumentRepository,
  RawDocumentRepositoryLive,
} from '@lily/api/repositories/raw-document.repository'
import { KnowledgeDrizzleLive } from '@lily/knowledge-db'
import {
  Array,
  ConfigProvider,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Predicate,
  String,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const makeRuntime = (knowledgeDatabaseUrl: string) =>
  ManagedRuntime.make(
    Layer.mergeAll(IngestJobRepositoryLive, RawDocumentRepositoryLive).pipe(
      Layer.provide(KnowledgeDrizzleLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            KNOWLEDGE_DATABASE_URL: knowledgeDatabaseUrl,
          })
        )
      )
    )
  )

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Ingest job claims and document dedup - Integration',
  () => {
    const adminUrl = Option.getOrElse(
      Option.fromNullishOr(process.env.DATABASE_URL_TEST),
      () => ''
    )
    const databaseName = `lily_ingest_${String.replaceAll('-', '')(randomUUID())}`
    let databaseUrl: string
    let pool: pg.Pool
    let runtime: ReturnType<typeof makeRuntime>

    const run = <A, E>(
      effect: Effect.Effect<A, E, IngestJobRepository | RawDocumentRepository>
    ) => runtime.runPromise(effect)

    const insertJob = async (
      status: 'pending' | 'in_progress',
      claimedAt: Date | null,
      createdAt: Date
    ) => {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO ingest_jobs (adapter, config, status, claimed_at, created_at)
         VALUES ('reddit', '{}', $1, $2, $3) RETURNING id`,
        [status, claimedAt, createdAt]
      )
      return result.rows[0]?.id ?? ''
    }

    const jobStatus = async (id: string) => {
      const result = await pool.query<{ status: string }>(
        'SELECT status FROM ingest_jobs WHERE id = $1',
        [id]
      )
      return result.rows[0]?.status
    }

    beforeAll(async () => {
      const admin = new pg.Client({ connectionString: adminUrl })
      await admin.connect()
      await admin.query(`CREATE DATABASE "${databaseName}"`)
      await admin.end()

      const url = new URL(adminUrl)
      url.pathname = `/${databaseName}`
      databaseUrl = url.toString()
      pool = new pg.Pool({ connectionString: databaseUrl })

      await pool.query(knowledgeTables)
      // Duplicates from before the migration must not make it fail.
      const oldJob = await pool.query<{ id: string }>(
        `INSERT INTO ingest_jobs (adapter, config) VALUES ('reddit', '{}') RETURNING id`
      )
      await pool.query(
        `INSERT INTO raw_documents (source, source_id, title, content, ingest_job_id, fetched_at)
         VALUES ('reddit', 'reddit_old', 'a', 'a', $1, now() - interval '1 day'),
                ('reddit', 'reddit_old', 'b', 'b', $1, now() - interval '1 day')`,
        [oldJob.rows[0]?.id]
      )
      await pool.query(await readFile(claimsMigration, 'utf-8'))
      await pool.query('TRUNCATE ingest_jobs CASCADE')

      runtime = makeRuntime(databaseUrl)
    })

    beforeEach(async () => {
      await pool.query('TRUNCATE ingest_jobs CASCADE')
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
      const admin = new pg.Client({ connectionString: adminUrl })
      await admin.connect()
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
      await admin.end()
    })

    it('applied the partial unique index over a table that already holds duplicates', async () => {
      const result = await pool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE indexname = 'raw_documents_source_id_unique'`
      )
      expect(result.rows[0]?.indexdef).toContain('UNIQUE')
      expect(result.rows[0]?.indexdef).toContain('fetched_at >=')
    })

    it('claims the oldest pending job and skips one another worker holds locked', async () => {
      const older = await insertJob(
        'pending',
        null,
        new Date('2024-01-01T00:00:00Z')
      )
      const newer = await insertJob(
        'pending',
        null,
        new Date('2024-01-02T00:00:00Z')
      )

      const holder = await pool.connect()
      await holder.query('BEGIN')
      await holder.query(
        'SELECT id FROM ingest_jobs WHERE id = $1 FOR UPDATE',
        [older]
      )
      try {
        const claimed = await run(
          Effect.flatMap(IngestJobRepository, (repo) => repo.claimNext)
        )
        expect(claimed?.id).toBe(newer)
        expect(claimed?.status).toBe('in_progress')
      } finally {
        await holder.query('ROLLBACK')
        holder.release()
      }

      const next = await run(
        Effect.flatMap(IngestJobRepository, (repo) => repo.claimNext)
      )
      expect(next?.id).toBe(older)

      const empty = await run(
        Effect.flatMap(IngestJobRepository, (repo) => repo.claimNext)
      )
      expect(empty).toBeNull()
    })

    it('hands two concurrent claimers two different jobs', async () => {
      await insertJob('pending', null, new Date('2024-01-01T00:00:00Z'))
      await insertJob('pending', null, new Date('2024-01-02T00:00:00Z'))

      const claimed = await run(
        Effect.flatMap(IngestJobRepository, (repo) =>
          Effect.forEach([1, 2], () => repo.claimNext, {
            concurrency: 'unbounded',
          })
        )
      )

      const ids = Array.map(
        Array.filter(claimed, Predicate.isNotNull),
        (job) => job.id
      )
      expect(ids).toHaveLength(2)
      expect(Array.dedupe(ids)).toHaveLength(2)
    })

    it('leaves a job whose claim was released to the worker that claims it next', async () => {
      const released = await insertJob(
        'pending',
        null,
        new Date('2024-01-01T00:00:00Z')
      )

      const [completed, failed] = await run(
        Effect.flatMap(IngestJobRepository, (repo) =>
          Effect.all([
            repo.complete(released, { documentsFetched: 3, chunksCreated: 9 }),
            repo.updateError(released, 'boom'),
          ])
        )
      )

      expect([completed._tag, failed._tag]).toEqual(['LostRace', 'LostRace'])
      expect(await jobStatus(released)).toBe('pending')
    })

    it('ends a job once: a failure after the completion does not overwrite it', async () => {
      const held = await insertJob(
        'in_progress',
        new Date(),
        new Date('2024-01-01T00:00:00Z')
      )

      const [completed, failed] = await run(
        Effect.flatMap(IngestJobRepository, (repo) =>
          Effect.all([
            repo.complete(held, { documentsFetched: 3, chunksCreated: 9 }),
            repo.updateError(held, 'boom'),
          ])
        )
      )

      expect([completed._tag, failed._tag]).toEqual(['Moved', 'LostRace'])
      expect(await jobStatus(held)).toBe('completed')
    })

    it('re-queues abandoned and unstamped claims but not live ones', async () => {
      const cutoff = new Date(Date.now() - 15 * 60 * 1000)
      const abandoned = await insertJob(
        'in_progress',
        new Date(cutoff.getTime() - 60 * 1000),
        new Date()
      )
      const unstamped = await insertJob('in_progress', null, new Date())
      const live = await insertJob('in_progress', new Date(), new Date())
      const finished = await pool.query<{ id: string }>(
        `INSERT INTO ingest_jobs (adapter, config, status, claimed_at)
         VALUES ('reddit', '{}', 'completed', $1) RETURNING id`,
        [new Date(cutoff.getTime() - 60 * 1000)]
      )

      const released = await run(
        Effect.flatMap(IngestJobRepository, (repo) =>
          repo.releaseStaleClaims(cutoff)
        )
      )

      expect(released).toBe(2)
      expect(await jobStatus(abandoned)).toBe('pending')
      expect(await jobStatus(unstamped)).toBe('pending')
      expect(await jobStatus(live)).toBe('in_progress')
      expect(await jobStatus(finished.rows[0]?.id ?? '')).toBe('completed')
    })

    it('stores a document once when two workers insert the same source_id together', async () => {
      const job = await insertJob('in_progress', new Date(), new Date())

      const results = await run(
        Effect.flatMap(RawDocumentRepository, (repo) =>
          Effect.forEach(
            ['first', 'second'],
            (title) =>
              repo.createIfNew(
                {
                  source: 'reddit',
                  sourceId: 'reddit_raced',
                  title,
                  content: title,
                  ingestJobId: job,
                },
                []
              ),
            { concurrency: 'unbounded' }
          )
        )
      )

      expect(Array.filter(results, (r) => r !== null)).toHaveLength(1)
      const stored = await pool.query(
        `SELECT id FROM raw_documents WHERE source_id = 'reddit_raced'`
      )
      expect(stored.rowCount).toBe(1)
    })
  }
)
