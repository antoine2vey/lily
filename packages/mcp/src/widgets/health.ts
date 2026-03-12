import { Match, pipe } from 'effect'

/**
 * Maps plant health status to a CSS class name for widget badges.
 * Classes are defined in the shared widget styles (styles.ts).
 */
export const healthColor = (health: string) =>
  pipe(
    Match.value(health),
    Match.when('THRIVING', () => 'health-thriving'),
    Match.when('HEALTHY', () => 'health-healthy'),
    Match.when('NEEDS_ATTENTION', () => 'health-warning'),
    Match.when('SICK', () => 'health-sick'),
    Match.when('RECOVERING', () => 'health-recovering'),
    Match.orElse(() => 'health-default')
  )

/**
 * Maps plant health status to a human-readable label.
 */
export const healthLabel = (health: string) =>
  pipe(
    Match.value(health),
    Match.when('THRIVING', () => 'Thriving'),
    Match.when('HEALTHY', () => 'Healthy'),
    Match.when('NEEDS_ATTENTION', () => 'Needs Attention'),
    Match.when('SICK', () => 'Sick'),
    Match.when('RECOVERING', () => 'Recovering'),
    Match.orElse(() => health)
  )
