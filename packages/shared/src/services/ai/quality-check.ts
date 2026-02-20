import { Effect, Match, pipe } from 'effect'

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
  readonly best: PlantAIResult
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
        best: null as unknown as PlantAIResult,
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
                best: result,
                done: true,
              })),
              Match.orElse(() => ({
                attempt: state.attempt + 1,
                best: pipe(
                  Match.value(state.attempt === 0),
                  Match.when(true, () => result),
                  Match.orElse(() =>
                    pipe(
                      Match.value(result.confidence > state.best.confidence),
                      Match.when(true, () => result),
                      Match.orElse(() => state.best)
                    )
                  )
                ),
                done: false,
              }))
            )
          ),
      }
    ),
    Effect.map((state) => state.best)
  )
