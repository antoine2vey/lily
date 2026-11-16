import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { carePermit, createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import {
  createInMemoryGCS,
  mockPublicUrl,
} from '@lily/api/__tests__/mocks/gcs.service'
import { MockOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { createMockSqlClient } from '@lily/api/__tests__/mocks/sql-client'
import { createMockStoredRefRepository } from '@lily/api/__tests__/mocks/stored-ref.repository'
import { RecordOutcome, Refusal } from '@lily/api/contexts/care'
import {
  createCareLog,
  createCareLogWithPhoto,
} from '@lily/api/services/care-logs/endpoints/create-care-log'
import { CareDay } from '@lily/shared'
import { Array, DateTime, Effect, Layer, Option, pipe } from 'effect'
import type { PersistedFile } from 'effect/http/Multipart'
import { describe, expect, it } from 'vitest'

const today = CareDay.make('2026-11-12')
const existing = pipe(Array.head(mockCareLogs), Option.getOrThrow)
const image = {
  _tag: 'PersistedFile',
  key: 'image',
  name: 'photo.png',
  contentType: 'image/png',
  path: '/tmp/photo.png',
} as unknown as PersistedFile

const setup = (
  outcome: 'Recorded' | 'AlreadyCared' = 'Recorded',
  sql: { commitUnanswered?: boolean } = {}
) => {
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
      createMockSqlClient(sql),
      MockOutboxLive,
      createMockStoredRefRepository()
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
      }).pipe(Effect.provide(test.layer))
    )

    expect(log.id).toBe(existing.id)
    expect(test.care.commands[0]).toMatchObject({
      careType: 'watering',
      on: { _tag: 'Today' },
      notes: Option.some('Deep soak'),
      photoUrl: Option.none(),
    })
  })

  it('stores an uploaded photo under the plant and records its URL', async () => {
    const test = setup()

    await Effect.runPromise(
      createCareLogWithPhoto(
        carePermit(existing.plantId),
        { type: 'watering' },
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

  it('deletes the uploaded photo when the care is refused', async () => {
    const test = setup('AlreadyCared')

    const outcome = await Effect.runPromise(
      createCareLogWithPhoto(
        carePermit(existing.plantId),
        { type: 'watering' },
        image
      ).pipe(
        Effect.as('recorded'),
        Effect.catchTag('AlreadyCaredTodayError', () =>
          Effect.succeed('refused')
        ),
        Effect.provide(test.layer)
      )
    )

    expect({ outcome, stored: [...test.gcs.objects.plant] }).toEqual({
      outcome: 'refused',
      stored: [],
    })
  })

  it('keeps the uploaded photo when the commit is not acknowledged', async () => {
    const test = setup('Recorded', { commitUnanswered: true })

    await Effect.runPromise(
      createCareLogWithPhoto(
        carePermit(existing.plantId),
        { type: 'watering' },
        image
      ).pipe(
        Effect.catchTag('SqlError', () => Effect.void),
        Effect.provide(test.layer)
      )
    )

    expect(Option.some([...test.gcs.objects.plant].map(mockPublicUrl))).toEqual(
      Option.map(test.care.commands[0]!.photoUrl, Array.of)
    )
  })
})
