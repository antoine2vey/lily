import { Duration } from 'effect'

/**
 * Number of days ahead (beyond today) that the care-task rolling window covers.
 *
 * Single source of truth: the API's `upcoming` cutoff AND the home calendar's
 * day-column count both derive from this value, so the data window and the
 * rendered grid can never drift out of sync (which previously dropped tasks
 * due on the last day). The calendar renders `CARE_TASK_WINDOW_DAYS + 1`
 * columns (today + N future days).
 */
export const CARE_TASK_WINDOW_DAYS = 7

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
