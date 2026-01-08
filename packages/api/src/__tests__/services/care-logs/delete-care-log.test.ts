import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { deleteCareLog } from '@lily/api/services/care-logs/endpoints/delete-care-log'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('deleteCareLog', () => {
  it('should delete existing care log', async () => {
    const result = await Effect.runPromise(
      deleteCareLog('plant-1', 'log-1').pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result.message).toContain('log-1')
    expect(result.message).toContain('deleted')
  })

  it('should return success message on deletion', async () => {
    const result = await Effect.runPromise(
      deleteCareLog('plant-1', 'log-2').pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result.message).toBe('Care log log-2 deleted successfully')
  })

  it('should fail with CareLogNotFoundError when log not found', async () => {
    const result = await Effect.runPromiseExit(
      deleteCareLog('plant-1', 'non-existent').pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when log belongs to different plant', async () => {
    const result = await Effect.runPromiseExit(
      deleteCareLog('plant-2', 'log-1').pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when store is empty', async () => {
    const result = await Effect.runPromiseExit(
      deleteCareLog('plant-1', 'log-1').pipe(
        Effect.provide(createMockCareLogRepository([]))
      )
    )

    expect(result._tag).toBe('Failure')
  })
})
