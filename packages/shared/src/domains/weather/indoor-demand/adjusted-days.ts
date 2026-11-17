/**
 * Turn a base watering interval and a demand multiplier into the adjusted
 * interval in days.
 *
 * WHY WE DIVIDE FREQUENCY BY THE MULTIPLIER:
 *   If the multiplier is 1.5 (plant needs 50% more water), watering should
 *   happen MORE OFTEN. Since frequency is expressed in days between waterings,
 *   a higher water need means fewer days between waterings:
 *     7 days / 1.5 = ~5 days (water more often)
 *     7 days / 0.5 = 14 days (water less often)
 *
 * WHY WE CLAMP:
 *   Safety bounds prevent absurd schedules:
 *   - Minimum 1 day: Can't water more than daily in the current system.
 *   - Maximum 2x original: Even in ideal conditions (cold, humid, no wind),
 *     don't extend more than double the base schedule. This prevents a plant
 *     set to every-7-days from being pushed to every-28-days in a cold snap.
 *
 * ROUNDING:
 *   Math.round for the nearest integer day, since the care system doesn't
 *   support sub-day scheduling.
 */
export function adjustedWateringDays(baseDays: number, demand: number): number {
  const adjusted = Math.round(baseDays / demand)
  return Math.max(1, Math.min(adjusted, baseDays * 2))
}
