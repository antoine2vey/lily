import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { carePermit, createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import {
  createInMemoryGCS,
  mockPublicUrl,
} from '@lily/api/__tests__/mocks/gcs.service'
import { MockOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { RecordOutcome, Refusal } from '@lily/api/contexts/care'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { CareDay } from '@lily/shared'
import { Array, DateTime, Effect, Layer, Option, pipe } from 'effect'
import type { PersistedFile } from 'effect/http/Multipart'
import { describe, expect, it } from 'vitest'

const today = CareDay.make('2026-11-12')
const existing = pipe(Array.head(mockCareLogs), Option.getOrThrow)
const deviceFile = 'file:///var/mobile/Containers/Data/tmp/photo.jpg'
const image = {
  _tag: 'PersistedFile',
  key: 'image',
  name: 'photo.png',
  contentType: 'image/png',
  path: '/tmp/photo.png',
} as unknown as PersistedFile

const setup = (outcome: 'Recorded' | 'AlreadyCared' = 'Recorded') => {
  const care = createStubCare((plantId) =>
    outcome === 'Recorded'
      ? RecordOutcome.Recorded({
          plantId,
          careLogId: existing.id,
          careType: 'watering',
          day: today,
          dueDay: Option.none(),
        })
      : RecordOutcome.Skipped({
          plantId,
          reason: Refusal.AlreadyCared({
            plantId,
            careType: 'watering',
            day: today,
          }),
        })
  )
  const gcs = createInMemoryGCS()
  return {
    care,
    gcs,
    layer: Layer.mergeAll(
      createMockCareLogRepository(mockCareLogs),
      care.layer,
      gcs.layer,
      createMockFileSystem(),
      MockSqlClientLive,
      MockOutboxLive
    ),
  }
}

describe('createCareLog', () => {
  it('records the care and returns its log', async () => {
    const test = setup()

    const log = await Effect.runPromise(
      createCareLog(carePermit(existing.plantId), {
        type: 'watering',
        notes: 'Deep soak',
        photoUrl: deviceFile,
      }).pipe(Effect.provide(test.layer))
    )

    expect(log.id).toBe(existing.id)
    expect(test.care.commands[0]).toMatchObject({
      careType: 'watering',
      on: { _tag: 'Today' },
      notes: Option.some('Deep soak'),
      photoUrl: Option.some(deviceFile),
    })
  })

  it('stores an uploaded photo under the plant and records its URL', async () => {
    const test = setup()

    await Effect.runPromise(
      createCareLog(
        carePermit(existing.plantId),
        { type: 'watering', photoUrl: deviceFile },
        image
      ).pipe(Effect.provide(test.layer))
    )

    const stored = [...test.gcs.objects.plant]
    expect({
      stored: Array.map(stored, (key) =>
        key.replace(/[0-9a-f-]{36}(?=\.)/, '<uuid>')
      ),
      recorded: test.care.commands[0]?.photoUrl,
    }).toEqual({
      stored: [`plants/${existing.plantId}/<uuid>.png`],
      recorded: Option.map(Array.head(stored), mockPublicUrl),
    })
  })

  it.each([
    ['a URL on another host', 'https://tracker.example/pixel.jpg'],
    [
      "another account's public photo",
      'https://storage.googleapis.com/mock-bucket/users/user-2/avatars/face.png',
    ],
  ])('records the care without a photo for %s', async (_case, photoUrl) => {
    const test = setup()

    await Effect.runPromise(
      createCareLog(carePermit(existing.plantId), {
        type: 'watering',
        photoUrl,
      }).pipe(Effect.provide(test.layer))
    )

    expect(test.care.commands[0]).toMatchObject({
      careType: 'watering',
      photoUrl: Option.none(),
    })
  })

  it('records the care at the date the client sent', async () => {
    const test = setup()
    const date = new Date('2026-11-10T08:00:00Z')

    await Effect.runPromise(
      createCareLog(carePermit(existing.plantId), {
        type: 'watering',
        date,
      }).pipe(Effect.provide(test.layer))
    )

    expect(test.care.commands[0]?.on).toEqual({
      _tag: 'At',
      instant: DateTime.makeUnsafe(date),
    })
  })

  it('fails when the plant was already cared for that day', async () => {
    const test = setup('AlreadyCared')

    const failure = await Effect.runPromise(
      createCareLog(carePermit(existing.plantId), { type: 'watering' }).pipe(
        Effect.flip,
        Effect.provide(test.layer)
      )
    )

    expect(failure._tag).toBe('AlreadyCaredTodayError')
  })
})
