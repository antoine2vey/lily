import type {
  GiftCodeRecord,
  IGiftCodeRepository,
} from '@lily/api/repositories/gift-code.repository'
import { GiftCodeRepository } from '@lily/api/repositories/gift-code.repository'
import type { giftCodeRedemptions } from '@lily/db/schema'
import { Effect, Layer, Option, pipe } from 'effect'

type Redemption = typeof giftCodeRedemptions.$inferSelect

interface MockGiftCodeOptions {
  codes?: readonly GiftCodeRecord[]
  redemptions?: readonly Redemption[]
  onIncrementUsage?: (id: string) => void
  onCreateRedemption?: (giftCodeId: string, userId: string) => void
}

export const createMockGiftCodeRepository = (
  options: MockGiftCodeOptions = {}
): Layer.Layer<GiftCodeRepository> => {
  const codes = options.codes ?? []
  const redemptions = options.redemptions ?? []

  const repo: IGiftCodeRepository = {
    create: (data) => {
      const created: GiftCodeRecord = {
        id: `code-${Date.now()}`,
        code: data.code.toUpperCase(),
        duration: data.duration,
        maxUsages: data.maxUsages,
        currentUsages: 0,
        isActive: true,
        expiresAt: data.expiresAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      return Effect.succeed(created)
    },

    findById: (id) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(codes.find((c) => c.id === id)),
          Option.getOrNull
        )
      ),

    findByCode: (code) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(codes.find((c) => c.code === code.toUpperCase())),
          Option.getOrNull
        )
      ),

    findAll: (params) => {
      const page = params.page ?? 1
      const limit = params.limit ?? 20
      const offset = (page - 1) * limit
      return Effect.succeed({
        items: codes.slice(offset, offset + limit),
        total: codes.length,
      })
    },

    update: (id, data) => {
      const existing = codes.find((c) => c.id === id)
      if (!existing) return Effect.succeed(null)
      return Effect.succeed({
        ...existing,
        ...(data.code !== undefined ? { code: data.code.toUpperCase() } : {}),
        ...(data.duration !== undefined ? { duration: data.duration } : {}),
        ...(data.maxUsages !== undefined ? { maxUsages: data.maxUsages } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
        updatedAt: new Date(),
      })
    },

    remove: (id) => {
      const existing = codes.find((c) => c.id === id)
      return Effect.succeed(existing ?? null)
    },

    incrementUsage: (id) => {
      if (options.onIncrementUsage) options.onIncrementUsage(id)
      return Effect.void
    },

    createRedemption: (giftCodeId, userId) => {
      if (options.onCreateRedemption)
        options.onCreateRedemption(giftCodeId, userId)
      const redemption: Redemption = {
        id: `redemption-${Date.now()}`,
        giftCodeId,
        userId,
        redeemedAt: new Date(),
      }
      return Effect.succeed(redemption)
    },

    findRedemption: (giftCodeId, userId) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(
            redemptions.find(
              (r) => r.giftCodeId === giftCodeId && r.userId === userId
            )
          ),
          Option.getOrNull
        )
      ),

    findRedemptionsByCode: (giftCodeId) => {
      const items = redemptions
        .filter((r) => r.giftCodeId === giftCodeId)
        .map((r) => ({
          id: r.id,
          giftCodeId: r.giftCodeId,
          userId: r.userId,
          userName: 'Test User' as string | null,
          userEmail: 'test@example.com',
          redeemedAt: r.redeemedAt,
        }))
      return Effect.succeed({ items, total: items.length })
    },
  }

  return Layer.succeed(GiftCodeRepository, repo)
}
