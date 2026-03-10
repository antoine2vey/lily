import { findCareTasks } from '@lily/api/services/care-tasks/endpoints/find-care-tasks'
import type { CareTask } from '@lily/shared'
import { Array, Effect } from 'effect'

/**
 * Returns care tasks grouped by overdue, today, and upcoming.
 * Reuses the same findCareTasks() function from the API.
 */
export const getCareTasksEffect = () =>
  Effect.gen(function* () {
    const tasks = yield* findCareTasks()

    const formatTask = (task: CareTask) => {
      const date = task.dueDate.toISOString().split('T')[0] ?? ''
      return `- **${task.plantName}** — ${task.type} (due: ${date})`
    }

    const sections: string[] = []

    const overdue = [...tasks.overdue]
    const today = [...tasks.today]
    const upcoming = [...tasks.upcoming]

    if (Array.isNonEmptyArray(overdue)) {
      sections.push(
        `### Overdue (${overdue.length})`,
        ...Array.map(overdue, formatTask)
      )
    }

    if (Array.isNonEmptyArray(today)) {
      sections.push(
        '',
        `### Today (${today.length})`,
        ...Array.map(today, formatTask)
      )
    }

    if (Array.isNonEmptyArray(upcoming)) {
      sections.push(
        '',
        `### Upcoming (${upcoming.length})`,
        ...Array.map(upcoming, formatTask)
      )
    }

    if (Array.isEmptyArray(sections)) {
      return 'No care tasks pending. All your plants are taken care of!'
    }

    return `## Care Tasks\n\n${Array.join(sections, '\n')}`
  }).pipe(Effect.withSpan('MCP.getCareTasks'))
