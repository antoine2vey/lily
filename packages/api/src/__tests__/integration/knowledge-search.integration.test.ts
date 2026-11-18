import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createMockDeadLetterRepository } from '@lily/api/__tests__/mocks/dead-letter.repository'
import {
  IngestJobRepository,
  IngestJobRepositoryLive,
} from '@lily/api/repositories/ingest-job.repository'
import {
  ProcessedChunkRepository,
  ProcessedChunkRepositoryLive,
} from '@lily/api/repositories/processed-chunk.repository'
import { RawDocumentRepositoryLive } from '@lily/api/repositories/raw-document.repository'
import { getAdapter } from '@lily/api/services/knowledge-ingestion/adapters'
import { backfillEmbeddings } from '@lily/api/services/knowledge-ingestion/embedding-backfill'
import { processIngestJob } from '@lily/api/services/knowledge-ingestion/processor'
import { KnowledgeDrizzleLive } from '@lily/knowledge-db'
import { embed, embedMany } from 'ai'
import {
  Array,
  ConfigProvider,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  pipe,
  Stream,
  String,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@ai-sdk/openai', () => {
  const fn = () => 'mock-model'
  fn.embedding = () => 'mock-model'
  return { openai: fn }
})

vi.mock('ai', () => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
  generateText: vi.fn().mockResolvedValue({ output: { keywords: ['care'] } }),
  Output: { object: vi.fn((opts: unknown) => opts) },
}))

vi.mock(
  '@lily/api/services/knowledge-ingestion/adapters',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@lily/api/services/knowledge-ingestion/adapters')
    >()),
    getAdapter: vi.fn(),
  })
)

const knowledgeDbDir = fileURLToPath(
  new URL('../../../../knowledge-db', import.meta.url)
)

const DIMENSIONS = 3072

const vectorAtCosineToQuery = (similarity: number) =>
  Array.makeBy(DIMENSIONS, (i) =>
    i === 0 ? similarity : i === 1 ? Math.sqrt(1 - similarity ** 2) : 0
  )

const embeddingAtCosineToQuery = (similarity: number) =>
  JSON.stringify(vectorAtCosineToQuery(similarity))

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
    Layer.mergeAll(
      ProcessedChunkRepositoryLive,
      RawDocumentRepositoryLive,
      IngestJobRepositoryLive,
      createMockDeadLetterRepository()
    ).pipe(
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

    it('returns chunks ingested during an embedding outage once the backfill has embedded them', async () => {
      const paragraph = (topic: string) =>
        `${topic} wants bright indirect light and evenly moist soil. `.repeat(6)
      const longGuide = Array.join(
        Array.makeBy(4, () => paragraph('A calathea')),
        '\n\n'
      )
      vi.mocked(getAdapter).mockReturnValueOnce(
        Effect.succeed({
          name: 'web',
          fetch: () =>
            Stream.fromIterable([
              {
                source: 'web',
                sourceId: 'calathea-guide',
                title: 'Calathea guide',
                content: longGuide,
              },
              {
                source: 'web',
                sourceId: 'calathea-note',
                title: 'Calathea note',
                content: paragraph('One calathea'),
              },
            ]),
        })
      )
      vi.mocked(embedMany).mockRejectedValue(new Error('503 from the model'))
      vi.mocked(embed).mockResolvedValue({
        embedding: vectorAtCosineToQuery(0.9),
      } as never)
      const calatheaHits = async () =>
        pipe(
          await search('calathea'),
          Array.filter((r) => String.includes('calathea')(r.content)),
          Array.map((r) => [
            r.content.trim(),
            Math.round(r.similarity * 100) / 100,
          ])
        )
      const chunksWithoutEmbedding = async () => {
        const result = await pool.query<{ kind: string; count: number }>(
          `SELECT CASE WHEN EXISTS (
                    SELECT 1 FROM processed_chunks child
                    WHERE child.parent_chunk_id = pc.id
                  ) THEN 'parent' ELSE 'searchable' END AS kind,
                  count(*)::int AS count
           FROM processed_chunks pc
           JOIN raw_documents rd ON rd.id = pc.document_id
           WHERE rd.source_id LIKE 'calathea-%' AND pc.embedding IS NULL
           GROUP BY kind ORDER BY kind`
        )
        return result.rows
      }

      await runtime.runPromise(
        Effect.gen(function* () {
          const jobs = yield* IngestJobRepository
          yield* jobs.create('web', { type: 'web', urls: [] })
          const job = yield* jobs.claimNext
          yield* processIngestJob(
            yield* Effect.fromNullishOr(job).pipe(Effect.orDie)
          )
        })
      )

      const afterOutage = await chunksWithoutEmbedding()
      expect(Array.map(afterOutage, (row) => row.kind)).toEqual([
        'parent',
        'searchable',
      ])
      expect(await calatheaHits()).toEqual([])

      await runtime.runPromise(backfillEmbeddings)

      expect(await chunksWithoutEmbedding()).toEqual([
        { kind: 'parent', count: 1 },
      ])
      expect(
        Array.every(vi.mocked(embed).mock.calls, ([call]) =>
          String.startsWith('keywords: care\n\n')(call.value as string)
        )
      ).toBe(true)
      const found = await calatheaHits()
      expect(found).toHaveLength(2)
      expect(found).toEqual(
        expect.arrayContaining([
          [longGuide.trim(), 0.9],
          [paragraph('One calathea').trim(), 0.9],
        ])
      )
    })
  }
)
