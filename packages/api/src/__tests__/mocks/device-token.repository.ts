import {
  DeviceTokenRepository,
  type IDeviceTokenRepository,
} from '@lily/api/repositories/device-token.repository'
import type { DeviceToken } from '@lily/shared/device-token'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export const createMockDeviceTokenRepository = (
  initial: DeviceToken[]
): Layer.Layer<DeviceTokenRepository> => {
  // Mutable in-memory store so the upsert semantics actually mutate state
  // (mirrors the unique constraint on `token` in the real DB).
  const store: DeviceToken[] = [...initial]

  const repo: IDeviceTokenRepository = {
    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(store, (t) => t.id === id),
          Option.getOrNull
        )
      ),

    findByToken: (token: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(store, (t) => t.token === token),
          Option.getOrNull
        )
      ),

    findByUserId: (userId: string) =>
      Effect.succeed(Array.filter(store, (t) => t.userId === userId)),

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
      store.push(newToken)
      return Effect.succeed(newToken)
    },

    upsertByToken: (data) => {
      const idx = store.findIndex((t) => t.token === data.token)
      if (idx === -1) {
        const created: DeviceToken = {
          id: `token-${crypto.randomUUID()}`,
          token: data.token,
          platform: data.platform,
          isActive: true,
          userId: data.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        store.push(created)
        return Effect.succeed(created)
      }
      const existing = store[idx]!
      const updated: DeviceToken = {
        ...existing,
        userId: data.userId,
        platform: data.platform,
        isActive: true,
        updatedAt: new Date(),
      }
      store[idx] = updated
      return Effect.succeed(updated)
    },

    update: (id, data) => {
      const idx = store.findIndex((t) => t.id === id)
      if (idx === -1) return Effect.succeed(null)
      const updated: DeviceToken = {
        ...store[idx]!,
        ...data,
        updatedAt: new Date(),
      }
      store[idx] = updated
      return Effect.succeed(updated)
    },

    delete: (id) => {
      const idx = store.findIndex((t) => t.id === id)
      if (idx === -1) return Effect.succeed(null)
      const [removed] = store.splice(idx, 1)
      return Effect.succeed(removed ?? null)
    },
  }

  return Layer.succeed(DeviceTokenRepository, repo)
}
