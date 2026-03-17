import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { deviceTokens } from '@lily/db/schema'
import { nowAsDate } from '@lily/shared'
import type { DeviceToken } from '@lily/shared/device-token'
import { and, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer } from 'effect'

// Types for repository methods
export interface CreateDeviceTokenData {
  token: string
  platform: 'ios' | 'android' | 'web'
  userId: string
}

export interface UpdateDeviceTokenData {
  isActive?: boolean
}

// Helper to map database row to API DeviceToken type
const mapToDeviceToken = (
  row: typeof deviceTokens.$inferSelect
): DeviceToken => ({
  id: row.id,
  token: row.token,
  platform: row.platform,
  isActive: row.isActive,
  userId: row.userId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

// Repository service interface
export interface IDeviceTokenRepository {
  readonly findById: (id: string) => Effect.Effect<DeviceToken | null, SqlError>
  readonly findByToken: (
    token: string
  ) => Effect.Effect<DeviceToken | null, SqlError>
  readonly findByUserId: (
    userId: string
  ) => Effect.Effect<DeviceToken[], SqlError>
  readonly findByTokenAndUserId: (
    token: string,
    userId: string
  ) => Effect.Effect<DeviceToken | null, SqlError>
  readonly create: (
    data: CreateDeviceTokenData
  ) => Effect.Effect<DeviceToken | null, SqlError>
  readonly update: (
    id: string,
    data: UpdateDeviceTokenData
  ) => Effect.Effect<DeviceToken | null, SqlError>
  readonly delete: (id: string) => Effect.Effect<DeviceToken | null, SqlError>
}

// Tag for dependency injection
export class DeviceTokenRepository extends Context.Tag('DeviceTokenRepository')<
  DeviceTokenRepository,
  IDeviceTokenRepository
>() {}

// Live implementation using PgDrizzle
export const DeviceTokenRepositoryLive = Layer.effect(
  DeviceTokenRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findById: Effect.fn('DeviceTokenRepository.findById')(function* (
        id: string
      ) {
        const [row] = yield* db
          .select()
          .from(deviceTokens)
          .where(eq(deviceTokens.id, id))
        return row ? mapToDeviceToken(row) : null
      }),

      findByToken: Effect.fn('DeviceTokenRepository.findByToken')(function* (
        token: string
      ) {
        const [row] = yield* db
          .select()
          .from(deviceTokens)
          .where(eq(deviceTokens.token, token))
        return row ? mapToDeviceToken(row) : null
      }),

      findByUserId: Effect.fn('DeviceTokenRepository.findByUserId')(function* (
        userId: string
      ) {
        const rows = yield* db
          .select()
          .from(deviceTokens)
          .where(eq(deviceTokens.userId, userId))
        return Array.map(rows, mapToDeviceToken)
      }),

      findByTokenAndUserId: Effect.fn(
        'DeviceTokenRepository.findByTokenAndUserId'
      )(function* (token: string, userId: string) {
        const [row] = yield* db
          .select()
          .from(deviceTokens)
          .where(
            and(eq(deviceTokens.token, token), eq(deviceTokens.userId, userId))
          )
        return row ? mapToDeviceToken(row) : null
      }),

      create: Effect.fn('DeviceTokenRepository.create')(function* (
        data: CreateDeviceTokenData
      ) {
        const [row] = yield* db
          .insert(deviceTokens)
          .values({
            token: data.token,
            platform: data.platform,
            userId: data.userId,
          })
          .returning()
        return row ? mapToDeviceToken(row) : null
      }),

      update: Effect.fn('DeviceTokenRepository.update')(function* (
        id: string,
        data: UpdateDeviceTokenData
      ) {
        const [row] = yield* db
          .update(deviceTokens)
          .set({
            ...data,
            updatedAt: nowAsDate(),
          })
          .where(eq(deviceTokens.id, id))
          .returning()
        return row ? mapToDeviceToken(row) : null
      }),

      delete: Effect.fn('DeviceTokenRepository.delete')(function* (id: string) {
        const [row] = yield* db
          .delete(deviceTokens)
          .where(eq(deviceTokens.id, id))
          .returning()
        return row ? mapToDeviceToken(row) : null
      }),
    }
  })
)
