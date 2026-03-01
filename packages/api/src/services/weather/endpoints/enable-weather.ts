import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { WeatherRepository } from '@lily/api/repositories/weather.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { WeatherCache } from '@lily/api/services/weather/cache'
import { getWeatherForLocation } from '@lily/api/services/weather/endpoints/get-weather'
import type { WeatherProvider } from '@lily/api/services/weather/provider'
import type { WeatherFetchError } from '@lily/shared'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'

// Enable weather-based care adjustments for the current user
export const enableWeatherForUser = (
  latitude: number,
  longitude: number
): Effect.Effect<
  void,
  SqlError | UserNotFoundError | WeatherFetchError,
  | CurrentUser
  | UserRepository
  | WeatherProvider
  | WeatherCache
  | WeatherRepository
> =>
  Effect.gen(function* () {
    const { id } = yield* CurrentUser
    const userRepo = yield* UserRepository
    const _cache = yield* WeatherCache

    // Update user record
    const user = yield* userRepo.update(id, {
      weatherEnabled: true,
      latitude,
      longitude,
    })

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    // Trigger initial weather fetch to populate cache
    yield* getWeatherForLocation(latitude, longitude).pipe(
      Effect.catchTag('WeatherFetchError', (error) =>
        Effect.logWarning('Initial weather fetch failed', { error })
      )
    )

    yield* Effect.log('Weather enabled for user', { userId: id })
  })

// Disable weather-based care adjustments for the current user
export const disableWeatherForUser = (): Effect.Effect<
  void,
  SqlError | UserNotFoundError,
  CurrentUser | UserRepository | WeatherCache
> =>
  Effect.gen(function* () {
    const { id } = yield* CurrentUser
    const userRepo = yield* UserRepository

    // Get current user to find their location before clearing
    const existingUser = yield* userRepo.findById(id)
    if (!existingUser) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    // Update user record — clear location
    const user = yield* userRepo.update(id, {
      weatherEnabled: false,
      latitude: null,
      longitude: null,
    })

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    yield* Effect.log('Weather disabled for user', { userId: id })
  })
