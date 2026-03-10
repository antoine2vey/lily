import { findCareTasks } from '@lily/api/services/care-tasks/endpoints/find-care-tasks'
import type { CareTask } from '@lily/shared'
import { Array, Effect } from 'effect'

/**
 * MCP resource handler for care-schedule://today
 * Returns today's care tasks as JSON.
 */
export const readCareScheduleResource = () =>
  Effect.gen(function* () {
    const tasks = yield* findCareTasks()

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
