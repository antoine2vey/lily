import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  ProcessedChunkRepository,
  ProcessedChunkRepositoryLive,
} from '@lily/api/repositories/processed-chunk.repository'
import { KnowledgeDrizzleLive } from '@lily/knowledge-db'
import {
  Array,
  ConfigProvider,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  String,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const knowledgeDbDir = fileURLToPath(
  new URL('../../../../knowledge-db', import.meta.url)
)

const DIMENSIONS = 3072

const embeddingAtCosineToQuery = (similarity: number) =>
  JSON.stringify(
    Array.makeBy(DIMENSIONS, (i) =>
      i === 0 ? similarity : i === 1 ? Math.sqrt(1 - similarity ** 2) : 0
    )
  )

const queryEmbedding = Array.makeBy(DIMENSIONS, (i) => (i === 0 ? 1 : 0))

const migrate = (databaseUrl: string) =>
  new Promise<void>((resolve, reject) => {
    execFile(
      'bun',
      ['scripts/migrate.ts'],
      {
        cwd: knowledgeDbDir,
        env: { ...process.env, KNOWLEDGE_DATABASE_URL: databaseUrl },
      },
      (error, stdout, stderr) =>
        Option.match(Option.fromNullishOr(error), {
          onNone: () => resolve(),
          onSome: (e) => reject(new Error(`${e.message}\n${stdout}${stderr}`)),
        })
    )
  })

const makeRuntime = (knowledgeDatabaseUrl: string) =>
  ManagedRuntime.make(
    ProcessedChunkRepositoryLive.pipe(
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

describe.skipIf(!process.env.KNOWLEDGE_DATABASE_URL_TEST)(
  'Hybrid knowledge search - Integration',
  () => {
    const adminUrl = Option.getOrElse(
      Option.fromNullishOr(process.env.KNOWLEDGE_DATABASE_URL_TEST),
      () => ''
    )
    const databaseName = `lily_search_${String.replaceAll('-', '')(randomUUID())}`
    let pool: pg.Pool
    let runtime: ReturnType<typeof makeRuntime>
    let documentId: string

    const insertChunk = async (content: string, similarity: number) => {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO processed_chunks (document_id, content, chunk_index, source, embedding)
         VALUES ($1, $2, 0, 'web', $3) RETURNING id`,
        [documentId, content, embeddingAtCosineToQuery(similarity)]
      )
      return Option.getOrElse(
        Option.map(Array.head(result.rows), (r) => r.id),
        () => ''
      )
    }

    const search = (queryText: string) =>
      runtime.runPromise(
        Effect.flatMap(ProcessedChunkRepository, (repo) =>
          repo.search({
            embedding: queryEmbedding,
            queryText,
            limit: 5,
            minSimilarity: 0.6,
          })
        )
      )

    beforeAll(async () => {
      const admin = new pg.Client({ connectionString: adminUrl })
      await admin.connect()
      await admin.query(`CREATE DATABASE "${databaseName}"`)
      await admin.end()

      const url = new URL(adminUrl)
      url.pathname = `/${databaseName}`
      const databaseUrl = url.toString()
      await migrate(databaseUrl)
      pool = new pg.Pool({ connectionString: databaseUrl })

      const job = await pool.query<{ id: string }>(
        `INSERT INTO ingest_jobs (adapter, config) VALUES ('web', '{}') RETURNING id`
      )
      const document = await pool.query<{ id: string }>(
        `INSERT INTO raw_documents (source, title, content, ingest_job_id)
         VALUES ('web', 'care', 'care', $1) RETURNING id`,
        [Option.getOrNull(Option.map(Array.head(job.rows), (r) => r.id))]
      )
      documentId = Option.getOrElse(
        Option.map(Array.head(document.rows), (r) => r.id),
        () => ''
      )

      runtime = makeRuntime(databaseUrl)
    }, 60_000)

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
      const admin = new pg.Client({ connectionString: adminUrl })
      await admin.connect()
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
      await admin.end()
    })

    it('returns a chunk that only full-text search found, after the vector hit, and nothing below the vector threshold', async () => {
      const vectorHit = await insertChunk(
        'Water when the top two centimetres of soil feel dry.',
        1
      )
      const keywordHit = await insertChunk(
        'Monstera deliciosa grows aerial roots toward a moss pole.',
        0.2
      )
      await insertChunk('Repot in spring into a pot one size larger.', 0.45)

      const results = await search('monstera')

      expect(
        Array.map(results, (r) => [r.id, Math.round(r.similarity * 100) / 100])
      ).toEqual([
        [vectorHit, 1],
        [keywordHit, 0.2],
      ])
    })
  }
)
