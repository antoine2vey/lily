import {
  type IRefreshTokenRepository,
  type RefreshToken,
  RefreshTokenRepository,
} from '@lily/api/repositories/refresh-token.repository'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export interface MockRefreshTokenRepositoryData {
  tokens: RefreshToken[]
}

// Internal state for tracking refresh tokens
let tokenStore: RefreshToken[] = []

export const createMockRefreshTokenRepository = (
  data: MockRefreshTokenRepositoryData = { tokens: [] }
): Layer.Layer<RefreshTokenRepository> => {
  // Initialize store with provided data
  tokenStore = [...data.tokens]

  const repo: IRefreshTokenRepository = {
    create: (userId: string, tokenHash: string, expiresAt: Date) =>
      Effect.sync(() => {
        const newToken: RefreshToken = {
          id: `refresh-token-${crypto.randomUUID()}`,
          userId,
          tokenHash,
          expiresAt,
          revokedAt: null,
          replacedBy: null,
          createdAt: new Date(),
        }
        tokenStore.push(newToken)
        return newToken
      }),

    findByTokenHash: (tokenHash: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(tokenStore, (t) => t.tokenHash === tokenHash),
          Option.getOrNull
        )
      ),

    findValidByTokenHash: (tokenHash: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(
            tokenStore,
            (t) =>
              t.tokenHash === tokenHash &&
              t.revokedAt === null &&
              t.expiresAt > new Date()
          ),
          Option.getOrNull
        )
      ),

    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(tokenStore, (t) => t.id === id),
          Option.getOrNull
        )
      ),

    revoke: (id: string) =>
      Effect.gen(function* () {
        const index = Array.findFirstIndex(tokenStore, (t) => t.id === id)
        if (Option.isNone(index)) {
          return null
        }

        const token = tokenStore[index.value]
        if (!token) {
          return null
        }

        const updated = {
          ...token,
          revokedAt: new Date(),
        }
        tokenStore[index.value] = updated
        return updated
      }),

    revokeWithReplacement: (id: string, replacedById: string) =>
      Effect.gen(function* () {
        const index = Array.findFirstIndex(tokenStore, (t) => t.id === id)
        if (Option.isNone(index)) {
          return null
        }

        const token = tokenStore[index.value]
        if (!token) {
          return null
        }

        const updated = {
          ...token,
          revokedAt: new Date(),
          replacedBy: replacedById,
        }
        tokenStore[index.value] = updated
        return updated
      }),

    revokeAllForUser: (userId: string) =>
      Effect.gen(function* () {
        let count = 0
        tokenStore = Array.map(tokenStore, (t) => {
          if (t.userId === userId && t.revokedAt === null) {
            count++
            return { ...t, revokedAt: new Date() }
          }
          return t
        })
        return count
      }),

    deleteExpiredAndRevoked: () =>
      Effect.gen(function* () {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const originalLength = tokenStore.length
        tokenStore = Array.filter(
          tokenStore,
          (t) => t.createdAt >= thirtyDaysAgo
        )
        return originalLength - tokenStore.length
      }),
  }

  return Layer.succeed(RefreshTokenRepository, repo)
}

// Helper to get the current state of the store
export const getRefreshTokenStore = () => [...tokenStore]

// Helper to clear the store
export const clearRefreshTokenStore = () => {
  tokenStore = []
}
