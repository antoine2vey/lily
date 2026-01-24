import { Duration } from 'effect'

/**
 * Query stale time constants using Effect Duration for type safety.
 * These values are used with React Query's staleTime option.
 */
export const StaleTime = {
  /** 5 minutes - default for most queries */
  default: Duration.toMillis(Duration.minutes(5)),
  /** 1 minute - for very frequently changing data */
  veryShort: Duration.toMillis(Duration.minutes(1)),
  /** 2 minutes - for frequently changing data (notifications, activities) */
  short: Duration.toMillis(Duration.minutes(2)),
  /** 30 minutes - for rarely changing data */
  long: Duration.toMillis(Duration.minutes(30)),
  /** 1 hour - for static data */
  veryLong: Duration.toMillis(Duration.hours(1)),
} as const
