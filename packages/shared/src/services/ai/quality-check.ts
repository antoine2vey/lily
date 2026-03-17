import { Effect, Match, Option, pipe } from 'effect'

import type { PlantAIResult } from './plant-schema'

/**
 * Check if a plant AI result has all the essential fields filled in.
 * A result is "sufficient" when name, wateringFrequencyDays, luxNeeded,
 * and humidityRating are all non-null.
 */
export const isPlantResultSufficient = (result: PlantAIResult): boolean =>
  result.name !== null &&
  result.wateringFrequencyDays !== null &&
  result.luxNeeded !== null &&
  result.humidityRating !== null

interface RetryState {
  readonly attempt: number
  readonly best: Option.Option<PlantAIResult>
  readonly done: boolean
}

/**
 * Wrap an AI call effect with automatic quality retry.
 * Retries up to `maxAttempts` times when the result is missing
 * core fields, returning the best result seen across all attempts.
 */
export const withQualityRetry = <E>(
  call: Effect.Effect<PlantAIResult, E>,
  maxAttempts = 3
): Effect.Effect<PlantAIResult, E> =>
  pipe(
    Effect.iterate(
      {
        attempt: 0,
        best: Option.none<PlantAIResult>(),
        done: false,
      } as RetryState,
      {
        while: (state) => !state.done && state.attempt < maxAttempts,
        body: (state) =>
          Effect.map(call, (result) =>
            pipe(
              Match.value(isPlantResultSufficient(result)),
              Match.when(true, () => ({
                attempt: state.attempt + 1,
                best: Option.some(result),
                done: true,
              })),
              Match.orElse(() => ({
                attempt: state.attempt + 1,
                best: pipe(
                  state.best,
                  Option.match({
                    onNone: () => Option.some(result),
                    onSome: (prev) =>
                      pipe(
                        Match.value(result.confidence > prev.confidence),
                        Match.when(true, () => Option.some(result)),
                        Match.orElse(() => Option.some(prev))
                      ),
                  })
                ),
                done: false,
              }))
            )
          ),
      }
    ),
    Effect.map((state) => Option.getOrThrow(state.best))
  )
