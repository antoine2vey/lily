import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { updateCareLog } from '@lily/api/services/care-logs/endpoints/update-care-log'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('updateCareLog', () => {
  it('should update care log notes', async () => {
    const result = await Effect.runPromise(
      updateCareLog('plant-1', 'log-1', { notes: 'Updated notes' }).pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result.notes).toBe('Updated notes')
  })

  it('should fail with CareLogNotFoundError when log not found', async () => {
    const result = await Effect.runPromiseExit(
      updateCareLog('plant-1', 'non-existent', { notes: 'Test' }).pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when log belongs to different plant', async () => {
    const result = await Effect.runPromiseExit(
      updateCareLog('plant-2', 'log-1', { notes: 'Test' }).pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should preserve other fields when updating', async () => {
    const result = await Effect.runPromise(
      updateCareLog('plant-1', 'log-1', { notes: 'Updated notes' }).pipe(
        Effect.provide(createMockCareLogRepository(mockCareLogs))
      )
    )

    expect(result.type).toBe(mockCareLogs[0]?.type)
    expect(result.plantId).toBe('plant-1')
    expect(result.id).toBe('log-1')
  })

  it('should update multiple fields at once', async () => {
    const newDate = new Date('2024-12-01')
    const result = await Effect.runPromise(
      updateCareLog('plant-1', 'log-1', {
        notes: 'Updated notes',
        date: newDate,
        photoUrl: 'https://example.com/new-photo.jpg',
      }).pipe(Effect.provide(createMockCareLogRepository(mockCareLogs)))
    )

    expect(result.notes).toBe('Updated notes')
    expect(result.date).toEqual(newDate)
    expect(result.photoUrl).toBe('https://example.com/new-photo.jpg')
  })
})
