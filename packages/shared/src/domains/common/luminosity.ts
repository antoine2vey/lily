import { Match, pipe } from 'effect'

export type LuminosityLevel = 1 | 2 | 3 | 4 | 5

export const LUMINOSITY_LEVELS = {
  1: { label: 'Low light', icon: '🌑' },
  2: { label: 'Medium light', icon: '🌤️' },
  3: { label: 'Bright indirect', icon: '⛅' },
  4: { label: 'Direct light', icon: '☀️' },
  5: { label: 'Full sun', icon: '🔆' },
} as const

export const luxToLuminosityLevel = (lux: number): LuminosityLevel =>
  pipe(
    Match.value(lux),
    Match.when(
      (v) => v < 250,
      () => 1 as const
    ),
    Match.when(
      (v) => v < 1_000,
      () => 2 as const
    ),
    Match.when(
      (v) => v < 5_000,
      () => 3 as const
    ),
    Match.when(
      (v) => v < 25_000,
      () => 4 as const
    ),
    Match.orElse(() => 5 as const)
  )
