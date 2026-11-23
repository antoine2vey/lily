import {
  type IRefreshTokenRepository,
  type RefreshToken,
  RefreshTokenRepository,
} from '@lily/api/repositories/refresh-token.repository'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export interface MockRefreshTokenRepositoryData {
  tokens: RefreshToken[]
}

let tokenStore: RefreshToken[] = []

export const createMockRefreshTokenRepository = (
  data: MockRefreshTokenRepositoryData = { tokens: [] }
): Layer.Layer<RefreshTokenRepository> => {
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

    findValidByTokenHash: (tokenHash: string, rotationGraceMs = 0) =>
      Effect.succeed(
        pipe(
          Array.findFirst(
            tokenStore,
            (t) =>
              t.tokenHash === tokenHash &&
              (t.revokedAt === null ||
                (rotationGraceMs > 0 &&
                  Date.now() - t.revokedAt.getTime() <= rotationGraceMs)) &&
              t.expiresAt > new Date()
          ),
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

    revokeAllForUser: (userId: string) =>
      Effect.gen(function* () {
        const originalLength = tokenStore.length
        tokenStore = Array.filter(tokenStore, (t) => t.userId !== userId)
        return originalLength - tokenStore.length
      }),

    deleteExpired: Effect.gen(function* () {
      const now = new Date()
      const originalLength = tokenStore.length
      tokenStore = Array.filter(tokenStore, (t) => t.expiresAt >= now)
      return originalLength - tokenStore.length
    }),
  }

  return Layer.succeed(RefreshTokenRepository, repo)
}

export const getRefreshTokenStore = () => [...tokenStore]

export const clearRefreshTokenStore = () => {
  tokenStore = []
}
