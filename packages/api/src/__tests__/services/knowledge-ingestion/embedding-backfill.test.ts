import { createMockProcessedChunkRepository } from '@lily/api/__tests__/mocks/processed-chunk.repository'
import type { CreateChunkData } from '@lily/api/repositories/raw-document.repository'
import {
  BACKFILL_BATCH_SIZE,
  backfillEmbeddings,
} from '@lily/api/services/knowledge-ingestion/embedding-backfill'
import { EmbeddingError } from '@lily/shared/errors/knowledge'
import { Array, Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@lily/api/services/rag/embedding.service', () => ({
  embedText: vi.fn(),
}))

import { embedText } from '@lily/api/services/rag/embedding.service'

const mockedEmbedText = vi.mocked(embedText)

const chunk = (overrides: Partial<CreateChunkData>): CreateChunkData => ({
  id: crypto.randomUUID(),
  content: 'Water a calathea with rainwater.',
  chunkIndex: 0,
  source: 'web',
  ...overrides,
})

const runBackfill = (insertedChunks: CreateChunkData[]) =>
  Effect.runPromise(
    backfillEmbeddings.pipe(
      Effect.provide(createMockProcessedChunkRepository({ insertedChunks }))
    )
  )

describe('backfillEmbeddings', () => {
  beforeEach(() => {
    mockedEmbedText.mockReset()
  })

  it('embeds a chunk stored without an embedding from its enriched text, and leaves its parent and embedded chunks alone', async () => {
    const parent = chunk({ content: 'The whole document.' })
    const unembedded = chunk({
      parentChunkId: parent.id,
      embeddingContent:
        'keywords: calathea\n\nWater a calathea with rainwater.',
    })
    const embedded = chunk({ parentChunkId: parent.id, embedding: [0.5] })
    mockedEmbedText.mockReturnValue(Effect.succeed([0.9]))

    const more = await runBackfill([parent, unembedded, embedded])

    expect(mockedEmbedText.mock.calls).toEqual([
      ['keywords: calathea\n\nWater a calathea with rainwater.'],
    ])
    expect([
      parent.embedding,
      unembedded.embedding,
      embedded.embedding,
    ]).toEqual([undefined, [0.9], [0.5]])
    expect(more).toBe(false)
  })

  it('keeps a chunk the model rejects for a later tick and still embeds the others', async () => {
    const rejected = chunk({ content: 'rejected' })
    const accepted = chunk({ content: 'accepted' })
    mockedEmbedText.mockImplementation((text) =>
      text === 'rejected'
        ? Effect.fail(new EmbeddingError({ message: 'too many tokens' }))
        : Effect.succeed([0.9])
    )

    const more = await runBackfill([rejected, accepted])

    expect([rejected.embedding, accepted.embedding]).toEqual([undefined, [0.9]])
    expect(more).toBe(false)
  })

  it('asks for another tick right away after a full batch, and leaves the rest for it', async () => {
    const chunks = Array.makeBy(BACKFILL_BATCH_SIZE + 1, (i) =>
      chunk({ content: `chunk ${i}` })
    )
    mockedEmbedText.mockReturnValue(Effect.succeed([0.9]))

    const more = await runBackfill(chunks)

    expect(more).toBe(true)
    expect(Array.filter(chunks, (c) => c.embedding === undefined)).toHaveLength(
      1
    )
  })

  it('asks for another tick after a full batch with one rejected chunk, and for none when the model rejects them all', async () => {
    const fullBatch = () =>
      Array.makeBy(BACKFILL_BATCH_SIZE, (i) => chunk({ content: `chunk ${i}` }))
    const outage = Effect.fail(new EmbeddingError({ message: 'API down' }))
    mockedEmbedText.mockImplementation((text) =>
      text === 'chunk 0' ? outage : Effect.succeed([0.9])
    )
    const afterOneRejection = await runBackfill(fullBatch())
    mockedEmbedText.mockImplementation(() => outage)
    const duringOutage = await runBackfill(fullBatch())

    expect([afterOneRejection, duringOutage]).toEqual([true, false])
  })

  it('calls no model when every chunk has its embedding', async () => {
    const more = await runBackfill([chunk({ embedding: [0.5] })])

    expect(mockedEmbedText).not.toHaveBeenCalled()
    expect(more).toBe(false)
  })
})
