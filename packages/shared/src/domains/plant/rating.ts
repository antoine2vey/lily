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

export const isPetSafe = (petToxicityRating: number): boolean =>
  petToxicityRating <= PET_SAFE_UP_TO
