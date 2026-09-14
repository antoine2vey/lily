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

/** Badge label for a plant in the cemetery; replaces the health label. */
export const MEMORIAL_LABEL = 'In memory'
export const MEMORIAL_COLOR = 'health-default'

/** Human-readable death cause for tool text. */
export const deathCauseLabel = (cause: string) =>
  pipe(
    Match.value(cause),
    Match.when('overwatering', () => 'overwatering'),
    Match.when('underwatering', () => 'underwatering'),
    Match.when('pests', () => 'pests'),
    Match.when('disease', () => 'disease'),
    Match.when('light', () => 'light (too much or too little)'),
    Match.when('cold', () => 'cold'),
    Match.when('heat', () => 'heat'),
    Match.when('repotting_shock', () => 'repotting shock'),
    Match.orElse(() => 'unknown cause')
  )
