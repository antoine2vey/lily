import { ApiClient } from '@lily/mcp/api-client'
import type { CareTask } from '@lily/shared'
import { Array, Effect, Schema } from 'effect'

const CareTaskJson = Schema.Struct({
  id: Schema.String,
  plantId: Schema.String,
  plantName: Schema.String,
  type: Schema.String,
  dueDate: Schema.String,
  completed: Schema.Boolean,
})

const CareScheduleJson = Schema.parseJson(
  Schema.Struct({
    overdue: Schema.Array(CareTaskJson),
    today: Schema.Array(CareTaskJson),
    upcoming: Schema.Array(CareTaskJson),
  })
)

const encodeCareSchedule = Schema.encode(CareScheduleJson)

/**
 * MCP resource handler for care-schedule://today
 * Fetches care tasks from the API and returns them as JSON.
 */
export const readCareScheduleResource = Effect.fn(
  'MCP.readCareScheduleResource'
)(function* () {
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

  return yield* encodeCareSchedule({
    overdue: Array.map(tasks.overdue, formatTask),
    today: Array.map(tasks.today, formatTask),
    upcoming: Array.map(tasks.upcoming, formatTask),
  })
})
