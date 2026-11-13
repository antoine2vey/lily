import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { carePermit, createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { RecordOutcome, Refusal } from '@lily/api/contexts/care'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { CareDay } from '@lily/shared'
import { Array, DateTime, Effect, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const today = CareDay.make('2026-11-12')
const existing = pipe(Array.head(mockCareLogs), Option.getOrThrow)

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
  return {
    care,
    layer: Layer.mergeAll(
      createMockCareLogRepository(mockCareLogs),
      care.layer
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
        photoUrl: 'https://example.com/p.jpg',
      }).pipe(Effect.provide(test.layer))
    )

    expect(log.id).toBe(existing.id)
    expect(test.care.commands[0]).toMatchObject({
      careType: 'watering',
      on: { _tag: 'Today' },
      notes: Option.some('Deep soak'),
      photoUrl: Option.some('https://example.com/p.jpg'),
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
