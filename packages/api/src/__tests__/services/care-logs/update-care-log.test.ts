import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { carePermit, createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { CareWhen } from '@lily/api/contexts/care'
import { updateCareLog } from '@lily/api/services/care-logs/endpoints/update-care-log'
import type { CareLogUpdateRequest } from '@lily/shared/care-log'
import { DateTime, Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const permit = carePermit('plant-1')

const update = (
  request: CareLogUpdateRequest,
  logs = mockCareLogs,
  care = createStubCare()
) => ({
  care,
  effect: updateCareLog(permit, 'log-1', request).pipe(
    Effect.provide(
      Layer.mergeAll(care.layer, createMockCareLogRepository(logs))
    )
  ),
})

describe('updateCareLog', () => {
  it('edits only the fields of the request and returns the log', async () => {
    const { care, effect } = update({ notes: 'Updated notes' })

    const log = await Effect.runPromise(effect)

    expect(care.amended).toEqual([
      {
        permit,
        careLogId: 'log-1',
        on: Option.none(),
        notes: Option.some(Option.some('Updated notes')),
        photoUrl: Option.none(),
      },
    ])
    expect(log.id).toBe('log-1')
  })

  it('moves the care to the instant of the request', async () => {
    const date = new Date('2024-12-01T08:30:00.000Z')
    const { care, effect } = update({
      date,
      photoUrl: 'https://example.com/new-photo.jpg',
    })

    await Effect.runPromise(effect)

    expect(care.amended[0]).toMatchObject({
      on: Option.some(CareWhen.At({ instant: DateTime.makeUnsafe(date) })),
      notes: Option.none(),
      photoUrl: Option.some(Option.some('https://example.com/new-photo.jpg')),
    })
  })

  it('fails with CareLogNotFoundError when the log is gone after the edit', async () => {
    const { effect } = update({ notes: 'Late' }, [])

    const failure = await Effect.runPromise(Effect.flip(effect))

    expect(failure._tag).toBe('CareLogNotFoundError')
  })
})
