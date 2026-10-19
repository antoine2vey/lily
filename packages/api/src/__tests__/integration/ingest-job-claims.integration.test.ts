import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
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

const claimsMigration = fileURLToPath(
  new URL(
    '../../../../knowledge-db/drizzle/0005_ingest_job_claims.sql',
    import.meta.url
  )
)

// The pieces of knowledge-db migration 0000 that the claim and dedup paths
// touch. The real file also creates processed_chunks with a halfvec column,
// which needs pgvector, and CI's Postgres has none.
const baseTables = `
  CREATE TYPE "ingest_job_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');
  CREATE TABLE "ingest_jobs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "adapter" text NOT NULL,
    "config" jsonb NOT NULL,
    "status" "ingest_job_status" DEFAULT 'pending' NOT NULL,
    "documents_fetched" integer DEFAULT 0 NOT NULL,
    "chunks_created" integer DEFAULT 0 NOT NULL,
    "cursor" text,
    "error" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "raw_documents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "source" text NOT NULL,
    "source_url" text,
    "source_id" text,
    "title" text NOT NULL,
    "content" text NOT NULL,
    "author" text,
    "score" integer,
    "metadata" jsonb,
    "ingest_job_id" uuid NOT NULL REFERENCES "ingest_jobs"("id") ON DELETE cascade,
    "fetched_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE INDEX "raw_documents_source_id_idx" ON "raw_documents" ("source_id");
`

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

      await pool.query(baseTables)
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
          Effect.flatMap(IngestJobRepository, (repo) => repo.claimNext())
        )
        expect(claimed?.id).toBe(newer)
        expect(claimed?.status).toBe('in_progress')
      } finally {
        await holder.query('ROLLBACK')
        holder.release()
      }

      const next = await run(
        Effect.flatMap(IngestJobRepository, (repo) => repo.claimNext())
      )
      expect(next?.id).toBe(older)

      const empty = await run(
        Effect.flatMap(IngestJobRepository, (repo) => repo.claimNext())
      )
      expect(empty).toBeNull()
    })

    it('hands two concurrent claimers two different jobs', async () => {
      await insertJob('pending', null, new Date('2024-01-01T00:00:00Z'))
      await insertJob('pending', null, new Date('2024-01-02T00:00:00Z'))

      const claimed = await run(
        Effect.flatMap(IngestJobRepository, (repo) =>
          Effect.forEach([1, 2], () => repo.claimNext(), {
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
              repo.createIfNew({
                source: 'reddit',
                sourceId: 'reddit_raced',
                title,
                content: title,
                ingestJobId: job,
              }),
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
