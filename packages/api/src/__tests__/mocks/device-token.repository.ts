import {
  DeviceTokenRepository,
  type IDeviceTokenRepository,
} from '@lily/api/repositories/device-token.repository'
import type { DeviceToken } from '@lily/shared/device-token'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export const createMockDeviceTokenRepository = (
  tokens: DeviceToken[]
): Layer.Layer<DeviceTokenRepository> => {
  const repo: IDeviceTokenRepository = {
    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(tokens, (t) => t.id === id),
          Option.getOrNull
        )
      ),

    findByToken: (token: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(tokens, (t) => t.token === token),
          Option.getOrNull
        )
      ),

    findByUserId: (userId: string) =>
      Effect.succeed(Array.filter(tokens, (t) => t.userId === userId)),

    findByTokenAndUserId: (token: string, userId: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(
            tokens,
            (t) => t.token === token && t.userId === userId
          ),
          Option.getOrNull
        )
      ),

    create: (data) => {
      const newToken: DeviceToken = {
        id: `token-${crypto.randomUUID()}`,
        token: data.token,
        platform: data.platform,
        isActive: true,
        userId: data.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      return Effect.succeed(newToken)
    },

    update: (id, data) => {
      const tokenOption = Array.findFirst(tokens, (t) => t.id === id)
      return Option.match(tokenOption, {
        onNone: () => Effect.succeed(null),
        onSome: (token) =>
          Effect.succeed({ ...token, ...data, updatedAt: new Date() }),
      })
    },

    delete: (id) =>
      Effect.succeed(
        pipe(
          Array.findFirst(tokens, (t) => t.id === id),
          Option.getOrNull
        )
      ),
  }

  return Layer.succeed(DeviceTokenRepository, repo)
}
