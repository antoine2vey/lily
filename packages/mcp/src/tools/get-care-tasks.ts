import { findCareTasks } from '@lily/api/services/care-tasks/endpoints/find-care-tasks'
import { type CareTask, formatIsoDate } from '@lily/shared'
import { Array, Effect, pipe } from 'effect'

/**
 * Returns care tasks grouped by overdue, today, and upcoming.
 * Reuses the same findCareTasks() function from the API.
 */
export const getCareTasksEffect = () =>
  Effect.gen(function* () {
    const tasks = yield* findCareTasks()

    const formatTask = (task: CareTask) =>
      `- **${task.plantName}** — ${task.type} (due: ${formatIsoDate(task.dueDate, '')})`

    const overdue = tasks.overdue as CareTask[]
    const today = tasks.today as CareTask[]
    const upcoming = tasks.upcoming as CareTask[]

    const sections = pipe(
      [
        Array.isNonEmptyArray(overdue)
          ? [
              `### Overdue (${overdue.length})`,
              ...Array.map(overdue, formatTask),
            ]
          : [],
        Array.isNonEmptyArray(today)
          ? ['', `### Today (${today.length})`, ...Array.map(today, formatTask)]
          : [],
        Array.isNonEmptyArray(upcoming)
          ? [
              '',
              `### Upcoming (${upcoming.length})`,
              ...Array.map(upcoming, formatTask),
            ]
          : [],
      ],
      Array.flatten
    )

    if (Array.isEmptyArray(sections)) {
      return 'No care tasks pending. All your plants are taken care of!'
    }

    return `## Care Tasks\n\n${Array.join(sections, '\n')}`
  }).pipe(Effect.withSpan('MCP.getCareTasks'))
