import {
  DeviceTokenRepository,
  type IDeviceTokenRepository,
} from '@lily/api/repositories/device-token.repository'
import type { DeviceToken } from '@lily/shared/device-token'
import { Effect, Layer } from 'effect'

export const createMockDeviceTokenRepository = (
  tokens: DeviceToken[]
): Layer.Layer<DeviceTokenRepository> => {
  const repo: IDeviceTokenRepository = {
    findById: (id: string) =>
      Effect.succeed(tokens.find((t) => t.id === id) ?? null),

    findByToken: (token: string) =>
      Effect.succeed(tokens.find((t) => t.token === token) ?? null),

    findByUserId: (userId: string) =>
      Effect.succeed(tokens.filter((t) => t.userId === userId)),

    findByTokenAndUserId: (token: string, userId: string) =>
      Effect.succeed(
        tokens.find((t) => t.token === token && t.userId === userId) ?? null
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
      const token = tokens.find((t) => t.id === id)
      if (!token) return Effect.succeed(null)
      return Effect.succeed({ ...token, ...data, updatedAt: new Date() })
    },

    delete: (id) => {
      const token = tokens.find((t) => t.id === id)
      return Effect.succeed(token ?? null)
    },
  }

  return Layer.succeed(DeviceTokenRepository, repo)
}
