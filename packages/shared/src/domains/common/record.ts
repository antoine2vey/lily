import { Record } from 'effect'

/**
 * Remove undefined values from an object while keeping null values.
 * Useful for building partial update objects for database operations.
 *
 * @param obj - The object to filter undefined values from
 * @param defaults - Optional initial values to merge with the compacted object
 */
export const compact = <
  T extends Record<string, unknown>,
  D extends Record<string, unknown> = Record<string, never>,
>(
  obj: T,
  defaults?: D
) => ({
  ...Record.filter(obj, (value) => value !== undefined),
  ...defaults,
})
