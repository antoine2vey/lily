import { createMockApiClient } from '@lily/mcp/__tests__/mocks/api-client'
import { CurrentJwt } from '@lily/mcp/api-client'
import { getCareTasksEffect } from '@lily/mcp/tools/get-care-tasks'
import type { CareTask } from '@lily/shared'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const JWT = 'test-jwt'
const JwtLayer = Layer.succeed(CurrentJwt, JWT)

const mockOverdueTask: CareTask = {
  id: 'task-1',
  plantId: 'plant-1',
  plantName: 'Overdue Fern',
  plantImageUrl: null,
  roomName: null,
  roomIcon: null,
  type: 'watering',
  dueDate: new Date('2024-06-14'),
  dueDayOffset: -1,
  localDueDate: '2024-06-14',
  completed: false,
}

describe('getCareTasks MCP tool', () => {
  it('should return grouped tasks with correct sections', async () => {
    const layer = createMockApiClient({
      getCareTasks: () =>
        Effect.succeed({
          overdue: [mockOverdueTask],
          today: [],
          upcoming: [],
          completedToday: 0,
          windowDays: [],
        }),
    })

    const result = await Effect.runPromise(
      getCareTasksEffect().pipe(Effect.provide(Layer.merge(layer, JwtLayer)))
    )

    expect(result.text).toContain('Care Tasks')
    expect(result.text).toContain('Overdue')
    expect(result.text).toContain('Overdue Fern')
  })

  it('should return "all taken care of" when empty', async () => {
    const layer = createMockApiClient()

    const result = await Effect.runPromise(
      getCareTasksEffect().pipe(Effect.provide(Layer.merge(layer, JwtLayer)))
    )

    expect(result.text).toContain('No care tasks pending')
    expect(result.text).toContain('taken care of')
  })

  it("prints the due day in the user's timezone", async () => {
    const auckland = {
      ...mockOverdueTask,
      dueDate: new Date('2026-10-27T12:00:00Z'),
      localDueDate: '2026-10-28',
    }
    const layer = createMockApiClient({
      getCareTasks: () =>
        Effect.succeed({
          overdue: [],
          today: [auckland],
          upcoming: [],
          completedToday: 0,
          windowDays: [],
        }),
    })

    const result = await Effect.runPromise(
      getCareTasksEffect().pipe(Effect.provide(Layer.merge(layer, JwtLayer)))
    )

    expect(result.text).toContain('(due: 2026-10-28)')
    expect(result.tasks.today.map((task) => task.dueDate)).toEqual([
      '2026-10-28',
    ])
  })
})
