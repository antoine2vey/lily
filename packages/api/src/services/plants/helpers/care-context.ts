import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { PlantOwner } from '@lily/shared'
import { Effect, Match, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface CareContext {
  readonly timezone: string
  readonly weather: {
    readonly enabled: boolean
    readonly latitude: number | null
    readonly longitude: number | null
  }
}

const noWeather = { enabled: false, latitude: null, longitude: null } as const

export const DEFAULT_CARE_CONTEXT: CareContext = {
  timezone: 'UTC',
  weather: noWeather,
}

export const careContext = (
  owner: PlantOwner
): Effect.Effect<CareContext, SqlError, UserRepository | CanopyRepository> =>
  pipe(
    Match.value(owner),
    Match.tag('User', ({ userId }) =>
      Effect.map(
        Effect.flatMap(UserRepository, (repo) => repo.findById(userId)),
        (user) =>
          pipe(
            Option.fromNullishOr(user),
            Option.match({
              onNone: () => DEFAULT_CARE_CONTEXT,
              onSome: (u): CareContext => ({
                timezone: pipe(
                  Option.fromNullishOr(u.timezone),
                  Option.getOrElse(() => 'UTC')
                ),
                weather: {
                  enabled: u.weatherEnabled === true,
                  latitude: u.latitude,
                  longitude: u.longitude,
                },
              }),
            })
          )
      )
    ),
    Match.tag('Canopy', ({ canopyId }) =>
      Effect.map(
        Effect.flatMap(CanopyRepository, (repo) => repo.findById(canopyId)),
        (canopy) =>
          pipe(
            Option.fromNullishOr(canopy),
            Option.match({
              onNone: () => DEFAULT_CARE_CONTEXT,
              onSome: (c): CareContext => ({
                timezone: c.timezone,
                weather: {
                  enabled: c.latitude !== null && c.longitude !== null,
                  latitude: c.latitude,
                  longitude: c.longitude,
                },
              }),
            })
          )
      )
    ),
    Match.exhaustive
  )
