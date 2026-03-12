import { ApiClient } from '@lily/mcp/api-client'
import type { CareTask } from '@lily/shared'
import { Array, Effect } from 'effect'

/**
 * MCP resource handler for care-schedule://today
 * Fetches care tasks from the API and returns them as JSON.
 */
export const readCareScheduleResource = () =>
  Effect.gen(function* () {
    const apiClient = yield* ApiClient
    const tasks = yield* apiClient.getCareTasks()

    const formatTask = (task: CareTask) => ({
      id: task.id,
      plantId: task.plantId,
      plantName: task.plantName,
      type: task.type,
      dueDate: task.dueDate.toISOString(),
      completed: task.completed,
    })

    return JSON.stringify(
      {
        overdue: Array.map(tasks.overdue, formatTask),
        today: Array.map(tasks.today, formatTask),
        upcoming: Array.map(tasks.upcoming, formatTask),
      },
      null,
      2
    )
  }).pipe(Effect.withSpan('MCP.readCareScheduleResource'))
