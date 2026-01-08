import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { getCareLog } from '@lily/api/services/care-logs/endpoints/get-care-log'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getCareLog', () => {
  it('should return care log when found', async () => {
    const result = await Effect.runPromise(
      getCareLog('plant-1', 'log-1').pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result).toEqual(mockCareLogs[0])
  })

  it('should fail with CareLogNotFoundError when log not found', async () => {
    const result = await Effect.runPromiseExit(
      getCareLog('plant-1', 'non-existent').pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when log exists but belongs to different plant', async () => {
    const result = await Effect.runPromiseExit(
      getCareLog('plant-2', 'log-1').pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when store is empty', async () => {
    const result = await Effect.runPromiseExit(
      getCareLog('plant-1', 'log-1').pipe(
        Effect.provide(createMockCareLogRepository([]))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should return correct log for given id and plantId', async () => {
    const result = await Effect.runPromise(
      getCareLog('plant-1', 'log-2').pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result.id).toBe('log-2')
    expect(result.type).toBe('fertilization')
    expect(result.plantId).toBe('plant-1')
  })
})
