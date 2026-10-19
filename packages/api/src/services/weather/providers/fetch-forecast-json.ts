import { WeatherFetchError } from '@lily/shared'
import { Duration, Effect } from 'effect'

// weather-scheduler.poll (all user locations in one tick) ran p99 0.43 s and
// at most 5.3 s over the 60 days to 2026-10-19. 10 s per request leaves room
// for slow days while still handing a hung provider to the fallback.
const WEATHER_FETCH_TIMEOUT = Duration.seconds(10)

/**
 * GETs a provider's forecast JSON. A hang past the deadline aborts the
 * request and fails with WeatherFetchError, the same error a bad response
 * gives, so the fallback provider takes over.
 */
export const fetchForecastJson = <A>(
  providerName: string,
  url: string
): Effect.Effect<A, WeatherFetchError> =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, { signal })
      if (!response.ok) {
        throw new Error(
          `${providerName} API returned ${response.status}: ${response.statusText}`
        )
      }
      return (await response.json()) as A
    },
    catch: (error) =>
      new WeatherFetchError({
        message: `${providerName} fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      }),
  }).pipe(
    Effect.timeoutOrElse({
      duration: WEATHER_FETCH_TIMEOUT,
      orElse: () =>
        Effect.fail(
          new WeatherFetchError({
            message: `${providerName} fetch failed: no response within ${Duration.format(WEATHER_FETCH_TIMEOUT)}`,
          })
        ),
    })
  )
