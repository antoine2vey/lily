import { createMockApiClient } from '@lily/mcp/__tests__/mocks/api-client'
import { CurrentJwt } from '@lily/mcp/api-client'
import { readCareScheduleResource } from '@lily/mcp/resources/care-schedule'
import type { CareTask } from '@lily/shared'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const JWT = 'test-jwt'
const JwtLayer = Layer.succeed(CurrentJwt, JWT)

const mockOverdueTask: CareTask = {
  id: 'task-1',
  plantId: 'plant-overdue',
  plantName: 'Thirsty Plant',
  plantImageUrl: null,
  roomName: null,
  roomIcon: null,
  type: 'watering',
  dueDate: new Date('2024-06-08T00:00:00Z'),
  completed: false,
}

describe('readCareScheduleResource', () => {
  it('should return valid JSON with overdue, today, and upcoming', async () => {
    const layer = Layer.merge(createMockApiClient(), JwtLayer)

    const result = await Effect.runPromise(
      readCareScheduleResource().pipe(Effect.provide(layer))
    )

    const parsed = JSON.parse(result)
    expect(parsed).toHaveProperty('overdue')
    expect(parsed).toHaveProperty('today')
    expect(parsed).toHaveProperty('upcoming')
  })

  it('should return empty arrays when no tasks', async () => {
    const layer = Layer.merge(createMockApiClient(), JwtLayer)

    const result = await Effect.runPromise(
      readCareScheduleResource().pipe(Effect.provide(layer))
    )

    const parsed = JSON.parse(result)
    expect(parsed.overdue).toEqual([])
    expect(parsed.today).toEqual([])
    expect(parsed.upcoming).toEqual([])
  })

  it('should include task details in overdue section', async () => {
    const layer = Layer.merge(
      createMockApiClient({
        getCareTasks: () =>
          Effect.succeed({
            overdue: [mockOverdueTask],
            today: [],
            upcoming: [],
          }),
      }),
      JwtLayer
    )

    const result = await Effect.runPromise(
      readCareScheduleResource().pipe(Effect.provide(layer))
    )

    const parsed = JSON.parse(result)
    expect(parsed.overdue).toHaveLength(1)
    expect(parsed.overdue[0].plantName).toBe('Thirsty Plant')
    expect(parsed.overdue[0].plantId).toBe('plant-overdue')
    expect(parsed.overdue[0].type).toBe('watering')
    expect(parsed.overdue[0].dueDate).toBeDefined()
  })
})
