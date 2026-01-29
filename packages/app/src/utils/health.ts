import { Match, pipe } from 'effect'

/**
 * UI-friendly health status for plant cards and displays
 */
export type HealthStatus = 'healthy' | 'attention' | 'critical'

/**
 * Map API health status to UI-friendly health status
 */
export const mapApiHealthToCardHealth = (health: string): HealthStatus =>
  pipe(
    Match.value(health),
    Match.when('HEALTHY', () => 'healthy' as const),
    Match.when('THRIVING', () => 'healthy' as const),
    Match.when('NEEDS_ATTENTION', () => 'attention' as const),
    Match.when('SICK', () => 'critical' as const),
    Match.orElse(() => 'healthy' as const)
  )

/**
 * Get Tailwind background class for health status dot
 */
export const getHealthDotClass = (health: HealthStatus): string =>
  pipe(
    Match.value(health),
    Match.when('healthy', () => 'bg-primary'),
    Match.when('attention', () => 'bg-orange-400'),
    Match.when('critical', () => 'bg-red-400'),
    Match.exhaustive
  )

/**
 * Get Tailwind text color class for health status
 */
export const getHealthTextClass = (health: HealthStatus): string =>
  pipe(
    Match.value(health),
    Match.when('healthy', () => 'text-primary'),
    Match.when('attention', () => 'text-orange-500'),
    Match.when('critical', () => 'text-red-500'),
    Match.exhaustive
  )
