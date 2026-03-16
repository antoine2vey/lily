import { RedisClient } from '@lily/api/services/message-queue/redis.provider'
import { WeatherCache } from '@lily/api/services/weather/cache'
import type { WeatherForecast } from '@lily/shared'
import {
  roundCoord,
  WEATHER_DATA_PREFIX,
  WEATHER_DATA_TTL_SECONDS,
  WEATHER_GEO_KEY,
} from '@lily/shared'
import {
  Array,
  Effect,
  String as EffectString,
  Layer,
  Option,
  pipe,
} from 'effect'

// Generate a member ID from rounded coordinates
const coordToId = (lat: number, lng: number): string =>
  `${roundCoord(lat)}_${roundCoord(lng)}`

// Parse a member ID back to coordinates
const idToCoord = (
  id: string
): Option.Option<{ latitude: number; longitude: number }> =>
  pipe(EffectString.split(id, '_'), (parts) =>
    parts.length === 2
      ? Option.some({
          latitude: Number.parseFloat(parts[0] as string),
          longitude: Number.parseFloat(parts[1] as string),
        })
      : Option.none()
  )

export const WeatherCacheLive = Layer.effect(
  WeatherCache,
  Effect.gen(function* () {
    const redis = yield* RedisClient

    return {
      findNearest: (lat, lng, radiusKm) =>
        Effect.tryPromise(async () => {
          // GEOSEARCH to find the closest cached location within radius
          const results = await redis.geosearch(
            WEATHER_GEO_KEY,
            'FROMLONLAT',
            lng,
            lat,
            'BYRADIUS',
            radiusKm,
            'km',
            'COUNT',
            1,
            'ASC'
          )

          if (!results || results.length === 0) {
            return Option.none<WeatherForecast>()
          }

          const memberId = results[0] as string
          const data = await redis.get(`${WEATHER_DATA_PREFIX}${memberId}`)

          if (!data) {
            return Option.none<WeatherForecast>()
          }

          return Option.some(JSON.parse(data) as WeatherForecast)
        }).pipe(
          Effect.catchTag('UnknownException', (e) =>
            Effect.logWarning('[weather-cache] findNearest failed', {
              error: String(e),
            }).pipe(Effect.as(Option.none<WeatherForecast>()))
          )
        ),

      store: (lat, lng, data) =>
        Effect.tryPromise(async () => {
          const memberId = coordToId(lat, lng)
          // Add location to geo set (lng, lat order for Redis GEOADD)
          await redis.geoadd(
            WEATHER_GEO_KEY,
            roundCoord(lng),
            roundCoord(lat),
            memberId
          )
          // Store forecast data with TTL
          await redis.set(
            `${WEATHER_DATA_PREFIX}${memberId}`,
            JSON.stringify(data),
            'EX',
            WEATHER_DATA_TTL_SECONDS
          )
        }).pipe(
          Effect.catchTag('UnknownException', (e) =>
            Effect.logWarning('[weather-cache] store failed', {
              error: String(e),
            })
          ),
          Effect.asVoid
        ),

      getAllLocations: () =>
        Effect.tryPromise(async () => {
          const members = await redis.zrange(WEATHER_GEO_KEY, 0, -1)
          return pipe(
            members,
            Array.filterMap((memberId) =>
              pipe(
                idToCoord(memberId),
                Option.map((coord) => ({
                  ...coord,
                  id: memberId,
                }))
              )
            )
          )
        }).pipe(
          Effect.catchTag('UnknownException', (e) =>
            Effect.logWarning('[weather-cache] getAllLocations failed', {
              error: String(e),
            }).pipe(
              Effect.as(
                [] as Array<{
                  latitude: number
                  longitude: number
                  id: string
                }>
              )
            )
          )
        ),

      removeLocation: (id) =>
        Effect.tryPromise(async () => {
          await redis.zrem(WEATHER_GEO_KEY, id)
          await redis.del(`${WEATHER_DATA_PREFIX}${id}`)
        }).pipe(
          Effect.catchTag('UnknownException', (e) =>
            Effect.logWarning('[weather-cache] removeLocation failed', {
              error: String(e),
            })
          ),
          Effect.asVoid
        ),
    }
  })
)
