import { ApiClient } from '@lily/mcp/api-client'
import type { CareTaskGroups, CareTaskItem } from '@lily/mcp/widgets/schemas'
import { type CareTask, formatIsoDate } from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

/**
 * Converts a CareTask into both a markdown line and a widget-friendly item
 * in a single pass.
 */
const mapTask = (task: CareTask, actionable: boolean) => ({
  line: `- **${task.plantName}** — ${task.type} (due: ${formatIsoDate(task.dueDate, '')})`,
  item: {
    id: task.id,
    plantId: task.plantId,
    plantName: task.plantName,
    careType: task.type,
    dueDate: formatIsoDate(task.dueDate, ''),
    roomName: Option.getOrNull(Option.fromNullable(task.roomName)),
    roomIcon: Option.getOrNull(Option.fromNullable(task.roomIcon)),
    actionable,
  } satisfies CareTaskItem,
})

/**
 * Returns care tasks grouped by overdue, today, and upcoming via the API.
 * Returns both markdown text and structured data for widget rendering.
 */
export const getCareTasksEffect = () =>
  Effect.gen(function* () {
    const apiClient = yield* ApiClient
    const tasks = yield* apiClient.getCareTasks()

    const overdue = tasks.overdue
    const today = tasks.today
    const upcoming = tasks.upcoming

    // Map each group to { line, item } pairs, then extract separately below
    const overdueMapped = Array.map(overdue, (t) => mapTask(t, true))
    const todayMapped = Array.map(today, (t) => mapTask(t, true))
    const upcomingMapped = Array.map(upcoming, (t) => mapTask(t, false))

    const sections = pipe(
      [
        Array.isNonEmptyArray(overdueMapped)
          ? [
              `### Overdue (${Array.length(overdue)})`,
              ...Array.map(overdueMapped, (m) => m.line),
            ]
          : [],
        Array.isNonEmptyArray(todayMapped)
          ? [
              '',
              `### Today (${Array.length(today)})`,
              ...Array.map(todayMapped, (m) => m.line),
            ]
          : [],
        Array.isNonEmptyArray(upcomingMapped)
          ? [
              '',
              `### Upcoming (${Array.length(upcoming)})`,
              ...Array.map(upcomingMapped, (m) => m.line),
            ]
          : [],
      ],
      Array.flatten
    )

    const taskGroups: CareTaskGroups = {
      overdue: Array.map(overdueMapped, (m) => m.item),
      today: Array.map(todayMapped, (m) => m.item),
      upcoming: Array.map(upcomingMapped, (m) => m.item),
    }

    if (Array.isEmptyArray(sections)) {
      return {
        text: 'No care tasks pending. All your plants are taken care of!',
        tasks: taskGroups,
      }
    }

    return {
      text: `## Care Tasks\n\n${Array.join(sections, '\n')}`,
      tasks: taskGroups,
    }
  }).pipe(Effect.withSpan('MCP.getCareTasks'))
