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
  type: 'water',
  dueDate: new Date('2024-06-14'),
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
})
