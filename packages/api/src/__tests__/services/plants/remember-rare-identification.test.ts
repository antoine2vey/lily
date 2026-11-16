import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockFileService } from '@lily/api/__tests__/mocks/file.service'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { MockLimitCheckerLive } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockRareIdentificationRepository } from '@lily/api/__tests__/mocks/rare-identification.repository'
import { createMockScanRepository } from '@lily/api/__tests__/mocks/scan.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockUsageTrackerLive } from '@lily/api/__tests__/mocks/usage-tracker'
import {
  type RareIdentification,
  RareIdentificationRepository,
} from '@lily/api/repositories/rare-identification.repository'
import { aiIdentify } from '@lily/api/services/plants/endpoints/ai-identify'
import { detect } from '@lily/api/services/plants/endpoints/detect'
import { scanCard } from '@lily/api/services/plants/endpoints/scan-card'
import { scanCardMultiple } from '@lily/api/services/plants/endpoints/scan-card-multiple'
import { Effect, Layer } from 'effect'
import type { PersistedFile } from 'effect/http/Multipart'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { describe, expect, it } from 'vitest'

const photo = (name: string) =>
  ({
    _tag: 'PersistedFile',
    key: 'images',
    name,
    contentType: 'image/jpeg',
    path: `/tmp/${name}`,
  }) as unknown as PersistedFile

const layerFor = (
  isRareHouseplant: boolean,
  repository: Layer.Layer<RareIdentificationRepository>
) =>
  Layer.mergeAll(
    createMockAiService({ isRareHouseplant }),
    createMockGCSService(),
    createMockFileService(),
    createMockFileSystem(),
    createMockEventBus(),
    createMockCurrentUser({ id: 'user-1' }),
    createMockScanRepository(),
    repository,
    MockLimitCheckerLive,
    MockUsageTrackerLive
  )

interface Identified {
  readonly imageUrl: string
  readonly isRareHouseplant: boolean
}

const endpoints: ReadonlyArray<{
  readonly name: string
  readonly identify: () => Effect.Effect<
    Identified,
    unknown,
    Layer.Success<ReturnType<typeof layerFor>>
  >
}> = [
  { name: 'detect', identify: () => detect([photo('plant.jpg')], 'en') },
  {
    name: 'ai-identify',
    identify: () => aiIdentify([photo('plant.jpg')], 'en'),
  },
  { name: 'scan-card', identify: () => scanCard([photo('card.jpg')], 'en') },
  {
    name: 'scan-card-multiple',
    identify: () =>
      scanCardMultiple([photo('card-1.jpg'), photo('card-2.jpg')], 'en'),
  },
]

const failingRecord = Layer.succeed(RareIdentificationRepository, {
  record: () =>
    Effect.fail(
      new SqlError({
        reason: new UnknownError({
          cause: new Error('database unreachable'),
          message: 'database unreachable',
        }),
      })
    ),
  exists: () => Effect.succeed(false),
})

describe.each(endpoints)('$name and the rarity answer', ({ identify }) => {
  const run = (
    isRareHouseplant: boolean,
    repository: Layer.Layer<RareIdentificationRepository>
  ) =>
    identify().pipe(
      Effect.provide(layerFor(isRareHouseplant, repository)),
      Effect.runPromise
    )

  it('remembers a rare answer for the user and the returned photo', async () => {
    const rows: RareIdentification[] = []

    const identified = await run(
      true,
      createMockRareIdentificationRepository(rows)
    )

    expect(identified.isRareHouseplant).toBe(true)
    expect(identified.imageUrl).toMatch(/^https:\/\//)
    expect(rows).toEqual([{ userId: 'user-1', imageUrl: identified.imageUrl }])
  })

  it('remembers nothing for an answer that is not rare', async () => {
    const rows: RareIdentification[] = []

    const identified = await run(
      false,
      createMockRareIdentificationRepository(rows)
    )

    expect(identified.isRareHouseplant).toBe(false)
    expect(rows).toEqual([])
  })

  it('still answers when remembering the rare answer fails', async () => {
    const identified = await run(true, failingRecord)

    expect(identified.isRareHouseplant).toBe(true)
  })
})
