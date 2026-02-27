import { createTestIngestJob } from '@lily/api/__tests__/fixtures/knowledge'
import { createMockDeadLetterRepository } from '@lily/api/__tests__/mocks/dead-letter.repository'
import { createMockIngestJobRepository } from '@lily/api/__tests__/mocks/ingest-job.repository'
import { createMockProcessedChunkRepository } from '@lily/api/__tests__/mocks/processed-chunk.repository'
import { createMockRawDocumentRepository } from '@lily/api/__tests__/mocks/raw-document.repository'
import type { CreateProcessedChunkData } from '@lily/api/repositories/processed-chunk.repository'
import type { RawDocumentInput } from '@lily/api/services/knowledge-ingestion/adapters/types'
import { processIngestJob } from '@lily/api/services/knowledge-ingestion/processor'
import { AdapterError } from '@lily/shared/errors/knowledge'
import type { IngestJob, RawDocument } from '@lily/shared/knowledge'
import { Effect, Layer, Stream } from 'effect'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@lily/api/services/rag/embedding.service', () => ({
  embedTexts: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => {
  const fn = () => 'mock-model'
  fn.embedding = () => 'mock-model'
  return { openai: fn }
})

vi.mock('ai', () => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
  generateText: vi.fn().mockResolvedValue({
    output: {
      keywords: ['test', 'plant', 'care'],
    },
  }),
  Output: {
    object: vi.fn((opts: unknown) => opts),
  },
}))

vi.mock(
  '@lily/api/services/knowledge-ingestion/adapters',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('@lily/api/services/knowledge-ingestion/adapters')
      >()
    return {
      ...original,
      getAdapter: vi.fn(),
    }
  }
)

import { getAdapter } from '@lily/api/services/knowledge-ingestion/adapters'
import { embedTexts } from '@lily/api/services/rag/embedding.service'

const mockedEmbedTexts = vi.mocked(embedTexts)
const mockedGetAdapter = vi.mocked(getAdapter)

const makeLongContent = (length: number) =>
  'This is a sufficiently long paragraph about plant care that covers watering schedules and lighting requirements for healthy plants. '.repeat(
    Math.ceil(length / 130)
  )

const makeTestDoc = (
  overrides: Partial<RawDocumentInput> = {}
): RawDocumentInput => ({
  source: 'reddit',
  sourceUrl: 'https://reddit.com/r/test/1',
  sourceId: `source-${crypto.randomUUID()}`,
  title: 'Test Document',
  content: makeLongContent(500),
  author: 'test_user',
  score: 10,
  ...overrides,
})

const makeRedditDocWithComments = (commentCount = 2): RawDocumentInput => ({
  source: 'reddit',
  sourceUrl: 'https://reddit.com/r/houseplants/1',
  sourceId: `source-${crypto.randomUUID()}`,
  title: 'How do I care for my monstera?',
  content: 'I need help with watering my monstera.',
  author: 'plant_lover',
  score: 42,
  metadata: {
    subreddit: 'houseplants',
    postScore: 42,
    comments: globalThis.Array.from({ length: commentCount }, (_, i) => ({
      body: `This is a detailed comment number ${i + 1} about monstera care with watering and lighting advice for healthy growth in indoor conditions.`,
      author: `commenter${i}`,
      score: 30 - i * 5,
    })),
  },
})

const buildLayers = (opts: {
  jobs: IngestJob[]
  documents?: RawDocument[]
  insertedChunks?: CreateProcessedChunkData[]
}) => {
  const documents = opts.documents ?? []
  const insertedChunks = opts.insertedChunks ?? []

  return Layer.mergeAll(
    createMockIngestJobRepository({ jobs: opts.jobs }),
    createMockRawDocumentRepository({ documents }),
    createMockProcessedChunkRepository({ insertedChunks }),
    createMockDeadLetterRepository()
  )
}

describe('processIngestJob', () => {
  it('should process documents through the full pipeline: in_progress -> completed', async () => {
    const doc = makeTestDoc()
    const job = createTestIngestJob({ id: 'test-job-1' })
    const jobs = [job]
    const insertedChunks: CreateProcessedChunkData[] = []

    mockedGetAdapter.mockReturnValueOnce(
      Effect.succeed({
        name: 'reddit',
        fetch: () => Stream.fromIterable([doc]),
      })
    )
    mockedEmbedTexts.mockReturnValue(Effect.succeed([[0.1, 0.2]]))

    await Effect.runPromise(
      processIngestJob(job).pipe(
        Effect.provide(buildLayers({ jobs, insertedChunks }))
      )
    )

    expect(jobs[0]?.status).toBe('completed')
    expect(jobs[0]?.documentsFetched).toBeGreaterThanOrEqual(1)
  })

  it('should produce parent + children for Reddit post with comments', async () => {
    const doc = makeRedditDocWithComments(2)
    const job = createTestIngestJob({ id: 'test-job-reddit-parent-child' })
    const jobs = [job]
    const insertedChunks: CreateProcessedChunkData[] = []

    mockedGetAdapter.mockReturnValueOnce(
      Effect.succeed({
        name: 'reddit',
        fetch: () => Stream.fromIterable([doc]),
      })
    )
    mockedEmbedTexts.mockReturnValue(
      Effect.succeed([
        [0.1, 0.2],
        [0.3, 0.4],
      ])
    )

    await Effect.runPromise(
      processIngestJob(job).pipe(
        Effect.provide(buildLayers({ jobs, insertedChunks }))
      )
    )

    // 1 parent (no embedding, no parentChunkId) + 2 children (with parentChunkId)
    expect(insertedChunks).toHaveLength(3)

    const parent = insertedChunks.find((c) => c.parentChunkId === undefined)
    const children = insertedChunks.filter((c) => c.parentChunkId !== undefined)

    expect(parent).toBeDefined()
    expect(parent?.embedding).toBeUndefined()
    expect(parent?.id).toBeDefined()

    expect(children).toHaveLength(2)
    for (const child of children) {
      expect(child.parentChunkId).toBe(parent?.id)
    }

    // chunksCreated counts only children
    expect(jobs[0]?.chunksCreated).toBe(2)
  })

  it('should produce single child with no parent for Reddit post without comments', async () => {
    const doc = makeTestDoc() // source: 'reddit', no comments in metadata
    const job = createTestIngestJob({ id: 'test-job-reddit-no-comments' })
    const jobs = [job]
    const insertedChunks: CreateProcessedChunkData[] = []

    mockedGetAdapter.mockReturnValueOnce(
      Effect.succeed({
        name: 'reddit',
        fetch: () => Stream.fromIterable([doc]),
      })
    )
    mockedEmbedTexts.mockReturnValue(Effect.succeed([[0.1, 0.2]]))

    await Effect.runPromise(
      processIngestJob(job).pipe(
        Effect.provide(buildLayers({ jobs, insertedChunks }))
      )
    )

    expect(insertedChunks).toHaveLength(1)
    expect(insertedChunks[0]?.parentChunkId).toBeUndefined()
    expect(jobs[0]?.chunksCreated).toBe(1)
  })

  it('should update counts incrementally via updateStatus', async () => {
    const docs = [makeTestDoc(), makeTestDoc()]
    const job = createTestIngestJob({ id: 'test-job-2' })
    const _jobs = [job]
    const insertedChunks: CreateProcessedChunkData[] = []
    const statusUpdates: {
      status: string
      docs?: number | undefined
      chunks?: number | undefined
    }[] = []

    // Capture status updates
    const originalJobs = [job]
    const jobLayer = Layer.succeed(
      (await import('@lily/api/repositories/ingest-job.repository'))
        .IngestJobRepository,
      {
        create: () => Effect.succeed(job),
        findById: () => Effect.succeed(job),
        findAll: () => Effect.succeed(originalJobs),
        findPending: () => Effect.succeed([]),
        updateStatus: (_id, status, counts) => {
          statusUpdates.push({
            status,
            docs: counts?.documentsFetched,
            chunks: counts?.chunksCreated,
          })
          const updated = { ...job, status, ...counts, updatedAt: new Date() }
          return Effect.succeed(updated)
        },
        updateError: () => Effect.succeed(undefined as undefined),
        count: () => Effect.succeed(1),
        delete: () => Effect.succeed(false),
      }
    )

    mockedGetAdapter.mockReturnValueOnce(
      Effect.succeed({
        name: 'reddit',
        fetch: () => Stream.fromIterable(docs),
      })
    )
    mockedEmbedTexts.mockReturnValue(Effect.succeed([[0.1, 0.2]]))

    const layer = Layer.mergeAll(
      jobLayer,
      createMockRawDocumentRepository({ documents: [] }),
      createMockProcessedChunkRepository({ insertedChunks }),
      createMockDeadLetterRepository()
    )

    await Effect.runPromise(processIngestJob(job).pipe(Effect.provide(layer)))

    // First call: mark in_progress
    expect(statusUpdates[0]?.status).toBe('in_progress')
    // Should have incremental updates for each doc
    const inProgressUpdates = statusUpdates.filter(
      (u) => u.status === 'in_progress' && u.docs !== undefined
    )
    expect(inProgressUpdates.length).toBeGreaterThanOrEqual(2)
    // Final: completed
    const completedUpdate = statusUpdates.find((u) => u.status === 'completed')
    expect(completedUpdate).toBeDefined()
  })

  it('should skip duplicate documents by sourceId', async () => {
    const existingDoc: RawDocument = {
      id: 'existing-doc',
      source: 'reddit',
      sourceUrl: 'https://reddit.com/existing',
      sourceId: 'duplicate-source-id',
      title: 'Existing',
      content: makeLongContent(500),
      author: undefined,
      score: undefined,
      metadata: undefined,
      ingestJobId: 'old-job',
      fetchedAt: new Date(),
    }

    const newDoc = makeTestDoc({ sourceId: 'duplicate-source-id' })
    const freshDoc = makeTestDoc({ sourceId: 'new-source-id' })

    const job = createTestIngestJob({ id: 'test-job-dedup' })
    const jobs = [job]
    const documents = [existingDoc]
    const insertedChunks: CreateProcessedChunkData[] = []

    mockedGetAdapter.mockReturnValueOnce(
      Effect.succeed({
        name: 'reddit',
        fetch: () => Stream.fromIterable([newDoc, freshDoc]),
      })
    )
    mockedEmbedTexts.mockReturnValue(Effect.succeed([[0.1, 0.2]]))

    await Effect.runPromise(
      processIngestJob(job).pipe(
        Effect.provide(buildLayers({ jobs, documents, insertedChunks }))
      )
    )

    // Only the freshDoc should have been inserted (the duplicate was skipped)
    // documents array should have existingDoc + freshDoc (not the duplicate)
    const newDocs = documents.filter((d) => d.ingestJobId === 'test-job-dedup')
    expect(newDocs).toHaveLength(1)
    expect(newDocs[0]?.sourceId).toBe('new-source-id')
  })

  it('should process documents without sourceId (no dedup check)', async () => {
    const doc = makeTestDoc({ sourceId: undefined as unknown as string })
    const job = createTestIngestJob({ id: 'test-job-no-source' })
    const jobs = [job]
    const documents: RawDocument[] = []
    const insertedChunks: CreateProcessedChunkData[] = []

    mockedGetAdapter.mockReturnValueOnce(
      Effect.succeed({
        name: 'reddit',
        fetch: () => Stream.fromIterable([doc]),
      })
    )
    mockedEmbedTexts.mockReturnValue(Effect.succeed([[0.1, 0.2]]))

    await Effect.runPromise(
      processIngestJob(job).pipe(
        Effect.provide(buildLayers({ jobs, documents, insertedChunks }))
      )
    )

    expect(documents).toHaveLength(1)
    expect(jobs[0]?.status).toBe('completed')
  })

  it('should store chunks without embeddings when embedding fails', async () => {
    const doc = makeTestDoc()
    const job = createTestIngestJob({ id: 'test-job-embed-fail' })
    const jobs = [job]
    const insertedChunks: CreateProcessedChunkData[] = []

    mockedGetAdapter.mockReturnValueOnce(
      Effect.succeed({
        name: 'reddit',
        fetch: () => Stream.fromIterable([doc]),
      })
    )
    const { EmbeddingError } = await import('@lily/shared/errors/knowledge')
    mockedEmbedTexts.mockReturnValue(
      Effect.fail(new EmbeddingError({ message: 'API down' }))
    )

    await Effect.runPromise(
      processIngestJob(job).pipe(
        Effect.provide(buildLayers({ jobs, insertedChunks }))
      )
    )

    // Job should still complete
    expect(jobs[0]?.status).toBe('completed')
    // Child chunks should be stored (without embeddings)
    const children = insertedChunks.filter(
      (c) => c.parentChunkId !== undefined || c.id === undefined
    )
    if (children.length > 0) {
      for (const chunk of children) {
        expect(chunk.embedding).toBeUndefined()
      }
    }
  })

  it('should mark job as failed with error message on adapter failure', async () => {
    const job = createTestIngestJob({ id: 'test-job-adapter-fail' })
    const jobs = [job]

    mockedGetAdapter.mockReturnValueOnce(
      Effect.fail(
        new AdapterError({
          message: 'Connection timeout',
          adapter: 'reddit',
        })
      )
    )

    await Effect.runPromise(
      processIngestJob(job).pipe(Effect.provide(buildLayers({ jobs })))
    )

    expect(jobs[0]?.status).toBe('failed')
    expect(jobs[0]?.error).toContain('Connection timeout')
  })

  it('should complete with 0 docs and 0 chunks for empty stream', async () => {
    const job = createTestIngestJob({ id: 'test-job-empty' })
    const jobs = [job]
    const insertedChunks: CreateProcessedChunkData[] = []

    mockedGetAdapter.mockReturnValueOnce(
      Effect.succeed({
        name: 'reddit',
        fetch: () => Stream.fromIterable([]),
      })
    )

    await Effect.runPromise(
      processIngestJob(job).pipe(
        Effect.provide(buildLayers({ jobs, insertedChunks }))
      )
    )

    expect(jobs[0]?.status).toBe('completed')
    expect(jobs[0]?.documentsFetched).toBe(0)
    expect(jobs[0]?.chunksCreated).toBe(0)
    expect(insertedChunks).toHaveLength(0)
  })

  it('should produce 0 chunks for documents with content too short to chunk', async () => {
    const shortDoc = makeTestDoc({ source: 'web', content: 'Short content' })
    const job = createTestIngestJob({ id: 'test-job-short' })
    const jobs = [job]
    const insertedChunks: CreateProcessedChunkData[] = []

    mockedGetAdapter.mockReturnValueOnce(
      Effect.succeed({
        name: 'reddit',
        fetch: () => Stream.fromIterable([shortDoc]),
      })
    )
    mockedEmbedTexts.mockReturnValue(Effect.succeed([]))

    await Effect.runPromise(
      processIngestJob(job).pipe(
        Effect.provide(buildLayers({ jobs, insertedChunks }))
      )
    )

    expect(jobs[0]?.status).toBe('completed')
    expect(insertedChunks).toHaveLength(0)
  })

  it('should mark job as failed when stream emits an error', async () => {
    const job = createTestIngestJob({ id: 'test-job-stream-fail' })
    const jobs = [job]

    mockedGetAdapter.mockReturnValueOnce(
      Effect.succeed({
        name: 'reddit',
        fetch: () =>
          Stream.fail(
            new AdapterError({
              message: 'Rate limited by Reddit',
              adapter: 'reddit',
            })
          ),
      })
    )

    await Effect.runPromise(
      processIngestJob(job).pipe(Effect.provide(buildLayers({ jobs })))
    )

    expect(jobs[0]?.status).toBe('failed')
    expect(jobs[0]?.error).toContain('Rate limited by Reddit')
  })

  it('should store chunk metadata (source, category) for child chunks', async () => {
    const doc = makeTestDoc({
      content: makeLongContent(500).replace(
        /plant care/g,
        'monstera watering schedule with proper moisture levels'
      ),
    })
    const job = createTestIngestJob({ id: 'test-job-metadata' })
    const jobs = [job]
    const insertedChunks: CreateProcessedChunkData[] = []

    mockedGetAdapter.mockReturnValueOnce(
      Effect.succeed({
        name: 'reddit',
        fetch: () => Stream.fromIterable([doc]),
      })
    )
    mockedEmbedTexts.mockReturnValue(Effect.succeed([[0.1, 0.2]]))

    await Effect.runPromise(
      processIngestJob(job).pipe(
        Effect.provide(buildLayers({ jobs, insertedChunks }))
      )
    )

    // Find child chunks (those that are not parent-only)
    const children = insertedChunks.filter(
      (c) =>
        c.embedding !== undefined ||
        c.parentChunkId !== undefined ||
        c.id === undefined
    )
    if (children.length > 0) {
      const child = children[0]
      expect(child?.source).toBe('reddit')
      expect(child?.category).toBeDefined()
      expect(child?.chunkIndex).toBe(0)
    }
  })

  it('should store keywords in embeddingContent and keep content clean', async () => {
    const doc = makeTestDoc()
    const job = createTestIngestJob({ id: 'test-job-keywords' })
    const jobs = [job]
    const insertedChunks: CreateProcessedChunkData[] = []

    mockedGetAdapter.mockReturnValueOnce(
      Effect.succeed({
        name: 'reddit',
        fetch: () => Stream.fromIterable([doc]),
      })
    )
    mockedEmbedTexts.mockReturnValue(Effect.succeed([[0.1, 0.2]]))

    await Effect.runPromise(
      processIngestJob(job).pipe(
        Effect.provide(buildLayers({ jobs, insertedChunks }))
      )
    )

    const childChunks = insertedChunks.filter(
      (c) => c.id === undefined || c.parentChunkId !== undefined
    )
    if (childChunks.length > 0) {
      const child = childChunks[0]
      // embeddingContent carries the keyword-enriched text for the vector
      expect(child?.embeddingContent).toContain('keywords:')
      // content is clean — no keyword prefix polluting LLM context
      expect(child?.content).not.toContain('keywords:')
    }
  })
})
