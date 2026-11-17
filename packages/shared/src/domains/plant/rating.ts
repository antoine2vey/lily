import { Match, pipe } from 'effect'
import type { LuminosityLevel } from '../common/luminosity'

export const PET_SAFE_UP_TO = 50

export const ratingLevel = (rating: number): LuminosityLevel =>
  pipe(
    Match.value(rating),
    Match.when(
      (v) => v <= 20,
      () => 1 as const
    ),
    Match.when(
      (v) => v <= 40,
      () => 2 as const
    ),
    Match.when(
      (v) => v <= 60,
      () => 3 as const
    ),
    Match.when(
      (v) => v <= 80,
      () => 4 as const
    ),
    Match.orElse(() => 5 as const)
  )

// Bands fitted on the plant catalog: they put 25 of its 31 entries at the
// level of their curated wateringRating. A frequency never earns level 5.
export const wateringRatingFromFrequency = (
  wateringFrequencyDays: number
): number =>
  pipe(
    Match.value(wateringFrequencyDays),
    Match.when(
      (days) => days <= 5,
      () => 70
    ),
    Match.when(
      (days) => days <= 8,
      () => 50
    ),
    Match.when(
      (days) => days <= 12,
      () => 30
    ),
    Match.orElse(() => 10)
  )

export const isPetSafe = (petToxicityRating: number): boolean =>
  petToxicityRating <= PET_SAFE_UP_TO
