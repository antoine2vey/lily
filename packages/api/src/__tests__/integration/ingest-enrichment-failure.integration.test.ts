import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  claimsMigration,
  knowledgeTables,
} from '@lily/api/__tests__/integration/knowledge-tables'
import {
  type DeadLetterRepository,
  DeadLetterRepositoryLive,
} from '@lily/api/repositories/dead-letter.repository'
import {
  IngestJobRepository,
  IngestJobRepositoryLive,
} from '@lily/api/repositories/ingest-job.repository'
import {
  type ProcessedChunkRepository,
  ProcessedChunkRepositoryLive,
} from '@lily/api/repositories/processed-chunk.repository'
import {
  type RawDocumentRepository,
  RawDocumentRepositoryLive,
} from '@lily/api/repositories/raw-document.repository'
import type { RawDocumentInput } from '@lily/api/services/knowledge-ingestion/adapters/types'
import { processIngestJob } from '@lily/api/services/knowledge-ingestion/processor'
import { DrizzleLive } from '@lily/db'
import { KnowledgeDrizzleLive } from '@lily/knowledge-db'
import type { IngestJob } from '@lily/shared/knowledge'
import {
  ConfigProvider,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Option,
  Stream,
  String,
} from 'effect'
import pg from 'pg'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('@ai-sdk/openai', () => {
  const fn = () => 'mock-model'
  fn.embedding = () => 'mock-model'
  return { openai: fn }
})

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
  embedMany: vi.fn(),
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

import { getAdapter } from '@lily/api/services/knowledge-ingestion/adapters'
import { APICallError, embedMany, generateText } from 'ai'

const mockedGenerateText = vi.mocked(generateText)
const mockedEmbedMany = vi.mocked(embedMany)
const mockedGetAdapter = vi.mocked(getAdapter)

const quotaExceeded = () =>
  new APICallError({
    message: 'You exceeded your current quota',
    url: 'https://api.openai.com/v1/responses',
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: false,
  })

const redditPost = (sourceId: string): RawDocumentInput => ({
  source: 'reddit',
  sourceUrl: `https://reddit.com/r/houseplants/${sourceId}`,
  sourceId,
  title: 'How do I care for my monstera?',
  content: 'I need help with watering my monstera.',
  author: 'plant_lover',
  score: 42,
  metadata: {
    subreddit: 'houseplants',
    postScore: 42,
    comments: [1, 2].map((n) => ({
      body: `Comment ${n}: water the monstera when the top two inches of soil are dry, and give it bright indirect light.`,
      author: `commenter${n}`,
      score: 30 - n,
    })),
  },
})

const makeRuntime = (knowledgeDatabaseUrl: string, databaseUrl: string) =>
  ManagedRuntime.make(
    Layer.mergeAll(
      Layer.mergeAll(
        IngestJobRepositoryLive,
        RawDocumentRepositoryLive,
        ProcessedChunkRepositoryLive
      ).pipe(Layer.provide(KnowledgeDrizzleLive)),
      DeadLetterRepositoryLive.pipe(Layer.provide(DrizzleLive))
    ).pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            KNOWLEDGE_DATABASE_URL: knowledgeDatabaseUrl,
            DATABASE_URL: databaseUrl,
          })
        )
      )
    )
  )

type Services =
  | IngestJobRepository
  | RawDocumentRepository
  | ProcessedChunkRepository
  | DeadLetterRepository

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Knowledge ingestion with a failing OpenAI - Integration',
  () => {
    const adminUrl = Option.getOrElse(
      Option.fromNullishOr(process.env.DATABASE_URL_TEST),
      () => ''
    )
    const databaseName = `lily_ingest_${String.replaceAll('-', '')(randomUUID())}`
    let pool: pg.Pool
    let primary: pg.Pool
    let runtime: ReturnType<typeof makeRuntime>
    const jobIds: string[] = []

    const run = <A, E>(effect: Effect.Effect<A, E, Services>) =>
      runtime.runPromise(effect)

    const claimJob = async (): Promise<IngestJob> => {
      const claimed = await run(
        Effect.flatMap(IngestJobRepository, (repo) => repo.claimNext())
      )
      if (!claimed) throw new Error('no pending job to claim')
      return claimed
    }

    const enqueueJob = async () => {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO ingest_jobs (adapter, config) VALUES ('reddit', '{}') RETURNING id`
      )
      const id = result.rows[0]?.id ?? ''
      jobIds.push(id)
      return id
    }

    const streamDocuments = (...docs: RawDocumentInput[]) =>
      mockedGetAdapter.mockReturnValue(
        Effect.succeed({
          name: 'reddit',
          fetch: () => Stream.fromIterable(docs),
        })
      )

    const jobRow = async (id: string) => {
      const result = await pool.query<{
        status: string
        error: string | null
        documents_fetched: number
        chunks_created: number
      }>(
        'SELECT status, error, documents_fetched, chunks_created FROM ingest_jobs WHERE id = $1',
        [id]
      )
      return result.rows[0]
    }

    const storedDocument = async (sourceId: string) => {
      const docs = await pool.query<{ id: string }>(
        'SELECT id FROM raw_documents WHERE source_id = $1',
        [sourceId]
      )
      const documentId = docs.rows[0]?.id
      const chunks = await pool.query<{
        content: string
        embedding_content: string | null
        is_parent: boolean
      }>(
        `SELECT content, embedding_content, parent_chunk_id IS NULL AS is_parent
         FROM processed_chunks WHERE document_id = $1 ORDER BY chunk_index, created_at`,
        [documentId ?? randomUUID()]
      )
      return { documentId, documents: docs.rowCount, chunks: chunks.rows }
    }

    beforeAll(async () => {
      const admin = new pg.Client({ connectionString: adminUrl })
      await admin.connect()
      await admin.query(`CREATE DATABASE "${databaseName}"`)
      await admin.end()

      const url = new URL(adminUrl)
      url.pathname = `/${databaseName}`
      pool = new pg.Pool({ connectionString: url.toString() })
      await pool.query(knowledgeTables)
      await pool.query(await readFile(claimsMigration, 'utf-8'))

      primary = new pg.Pool({ connectionString: adminUrl })
      runtime = makeRuntime(url.toString(), adminUrl)
    })

    beforeEach(async () => {
      await pool.query('TRUNCATE ingest_jobs CASCADE')
      mockedEmbedMany.mockImplementation(
        async ({ values }) =>
          ({ embeddings: values.map(() => [0.1, 0.2]) }) as unknown as Awaited<
            ReturnType<typeof embedMany>
          >
      )
    })

    afterAll(async () => {
      await primary.query(
        `DELETE FROM dead_letter_messages WHERE payload->>'ingestJobId' = ANY($1)`,
        [jobIds]
      )
      await primary.end()
      await runtime.dispose()
      await pool.end()
      const admin = new pg.Client({ connectionString: adminUrl })
      await admin.connect()
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
      await admin.end()
    })

    it('stores raw chunks and completes the job when enrichment keeps hitting a quota error', async () => {
      mockedGenerateText.mockRejectedValue(quotaExceeded())
      const sourceId = `reddit_${randomUUID()}`
      streamDocuments(redditPost(sourceId))
      await enqueueJob()
      const job = await claimJob()

      await runtime.runPromiseExit(processIngestJob(job))

      expect(await jobRow(job.id)).toMatchObject({
        status: 'completed',
        error: null,
        documents_fetched: 1,
        chunks_created: 2,
      })
      const stored = await storedDocument(sourceId)
      expect(stored.documents).toBe(1)
      expect(stored.chunks).toHaveLength(3)
      const children = stored.chunks.filter((c) => !c.is_parent)
      expect(children).toHaveLength(2)
      for (const child of children) {
        expect(child.embedding_content).toBeNull()
        expect(child.content).toContain('water the monstera')
      }

      const deadLetters = await primary.query<{ error: string }>(
        `SELECT error FROM dead_letter_messages
         WHERE topic = 'enrichment.chunk_failed' AND payload->>'documentId' = $1`,
        [stored.documentId]
      )
      expect(deadLetters.rows).toHaveLength(2)
      for (const row of deadLetters.rows) {
        expect(row.error).toContain('Rate limited or quota exceeded')
      }
    }, 30_000)

    it('leaves no document behind when the worker stops mid-enrichment, so the next claim stores it whole', async () => {
      let enrichmentStarted: () => void = () => {}
      const started = new Promise<void>((resolve) => {
        enrichmentStarted = resolve
      })
      mockedGenerateText.mockImplementation(() => {
        enrichmentStarted()
        return new Promise(() => {})
      })
      const sourceId = `reddit_${randomUUID()}`
      streamDocuments(redditPost(sourceId))
      const jobId = await enqueueJob()

      const fiber = runtime.runFork(processIngestJob(await claimJob()))
      await started
      await runtime.runPromise(Fiber.interrupt(fiber))

      expect((await jobRow(jobId))?.status).toBe('in_progress')

      mockedGenerateText.mockResolvedValue({
        output: { keywords: ['monstera', 'watering', 'light'] },
      } as Awaited<ReturnType<typeof generateText>>)
      await run(
        Effect.flatMap(IngestJobRepository, (repo) =>
          repo.releaseStaleClaims(new Date(Date.now() + 60_000))
        )
      )
      const exit = await runtime.runPromiseExit(
        processIngestJob(await claimJob())
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect((await jobRow(jobId))?.status).toBe('completed')
      const stored = await storedDocument(sourceId)
      expect(stored.documents).toBe(1)
      expect(stored.chunks).toHaveLength(3)
    }, 30_000)
  }
)
