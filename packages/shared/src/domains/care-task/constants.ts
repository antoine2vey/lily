import { Duration } from 'effect'

/**
 * Duration for the undo timeout when completing a care task.
 * Used by both the UI animation and the actual timeout logic.
 */
export const CARE_TASK_UNDO_TIMEOUT = Duration.seconds(5)

/**
 * Get the undo timeout in milliseconds for use in animations and setTimeout.
 */
export const CARE_TASK_UNDO_TIMEOUT_MS = Duration.toMillis(
  CARE_TASK_UNDO_TIMEOUT
)
