import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  subscriptionEvents,
  subscriptionTiers,
  subscriptionUsage,
  userSubscriptions,
} from '@lily/db'
import type {
  SubscriptionStatus,
  SubscriptionTier,
  TierConfig,
  UsageField,
} from '@lily/shared'
import { and, eq, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

export interface CreateSubscriptionData {
  userId: string
  tier: SubscriptionTier
  status: SubscriptionStatus
  trialStartsAt?: Date | null
  trialEndsAt?: Date | null
  currentPeriodStart: Date
  currentPeriodEnd: Date
  externalSubscriptionId?: string | null
  externalCustomerId?: string | null
  provider?: 'revenuecat'
  productId?: string | null
  store?: 'APP_STORE' | 'PLAY_STORE' | null
}

export interface ISubscriptionRepository {
  // Subscription CRUD
  readonly findByUserId: (
    userId: string
  ) => Effect.Effect<typeof userSubscriptions.$inferSelect | null, SqlError>

  readonly findByExternalId: (
    externalSubscriptionId: string
  ) => Effect.Effect<typeof userSubscriptions.$inferSelect | null, SqlError>

  readonly create: (
    data: CreateSubscriptionData
  ) => Effect.Effect<typeof userSubscriptions.$inferSelect | null, SqlError>

  readonly updateStatus: (
    userId: string,
    status: SubscriptionStatus
  ) => Effect.Effect<typeof userSubscriptions.$inferSelect | null, SqlError>

  readonly updateFromWebhook: (
    externalSubscriptionId: string,
    data: Partial<CreateSubscriptionData>
  ) => Effect.Effect<typeof userSubscriptions.$inferSelect | null, SqlError>

  readonly updateByUserId: (
    userId: string,
    data: Partial<CreateSubscriptionData>
  ) => Effect.Effect<typeof userSubscriptions.$inferSelect | null, SqlError>

  readonly cancel: (
    userId: string
  ) => Effect.Effect<typeof userSubscriptions.$inferSelect | null, SqlError>

  // Tier configuration
  readonly getTier: (
    tier: SubscriptionTier
  ) => Effect.Effect<TierConfig, SqlError>

  readonly getAllTiers: () => Effect.Effect<TierConfig[], SqlError>

  // Usage tracking
  readonly getCurrentUsage: (
    userId: string
  ) => Effect.Effect<typeof subscriptionUsage.$inferSelect | null, SqlError>

  readonly getOrCreateUsage: (
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ) => Effect.Effect<typeof subscriptionUsage.$inferSelect, SqlError>

  readonly incrementUsage: (
    userId: string,
    field: UsageField
  ) => Effect.Effect<typeof subscriptionUsage.$inferSelect | null, SqlError>

  // Events
  readonly logEvent: (
    userId: string,
    eventType: string,
    metadata?: object
  ) => Effect.Effect<void, SqlError>
}

export class SubscriptionRepository extends Context.Tag(
  'SubscriptionRepository'
)<SubscriptionRepository, ISubscriptionRepository>() {}

export const SubscriptionRepositoryLive = Layer.effect(
  SubscriptionRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const getMonthBoundaries = () => {
      const now = new Date()
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const periodEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      )
      return { periodStart, periodEnd }
    }

    return {
      findByUserId: (userId: string) =>
        Effect.gen(function* () {
          const [subscription] = yield* db
            .select()
            .from(userSubscriptions)
            .where(eq(userSubscriptions.userId, userId))
          return Option.getOrNull(Option.fromNullable(subscription))
        }),

      findByExternalId: (externalSubscriptionId: string) =>
        Effect.gen(function* () {
          const [subscription] = yield* db
            .select()
            .from(userSubscriptions)
            .where(
              eq(
                userSubscriptions.externalSubscriptionId,
                externalSubscriptionId
              )
            )
          return Option.getOrNull(Option.fromNullable(subscription))
        }),

      create: (data: CreateSubscriptionData) =>
        Effect.gen(function* () {
          const [subscription] = yield* db
            .insert(userSubscriptions)
            .values({
              userId: data.userId,
              tier: data.tier,
              status: data.status,
              trialStartsAt: Option.getOrNull(
                Option.fromNullable(data.trialStartsAt)
              ),
              trialEndsAt: Option.getOrNull(
                Option.fromNullable(data.trialEndsAt)
              ),
              currentPeriodStart: data.currentPeriodStart,
              currentPeriodEnd: data.currentPeriodEnd,
              externalSubscriptionId: Option.getOrNull(
                Option.fromNullable(data.externalSubscriptionId)
              ),
              externalCustomerId: Option.getOrNull(
                Option.fromNullable(data.externalCustomerId)
              ),
              provider: pipe(
                Option.fromNullable(data.provider),
                Option.getOrElse(() => 'revenuecat' as const)
              ),
              productId: Option.getOrNull(Option.fromNullable(data.productId)),
              store: Option.getOrNull(Option.fromNullable(data.store)),
            })
            .onConflictDoUpdate({
              target: userSubscriptions.userId,
              set: {
                tier: data.tier,
                status: data.status,
                trialStartsAt: Option.getOrNull(
                  Option.fromNullable(data.trialStartsAt)
                ),
                trialEndsAt: Option.getOrNull(
                  Option.fromNullable(data.trialEndsAt)
                ),
                currentPeriodStart: data.currentPeriodStart,
                currentPeriodEnd: data.currentPeriodEnd,
                externalSubscriptionId: Option.getOrNull(
                  Option.fromNullable(data.externalSubscriptionId)
                ),
                externalCustomerId: Option.getOrNull(
                  Option.fromNullable(data.externalCustomerId)
                ),
                provider: pipe(
                  Option.fromNullable(data.provider),
                  Option.getOrElse(() => 'revenuecat' as const)
                ),
                productId: Option.getOrNull(
                  Option.fromNullable(data.productId)
                ),
                store: Option.getOrNull(Option.fromNullable(data.store)),
                updatedAt: new Date(),
              },
            })
            .returning()
          return Option.getOrNull(Option.fromNullable(subscription))
        }),

      updateStatus: (userId: string, status: SubscriptionStatus) =>
        Effect.gen(function* () {
          const [subscription] = yield* db
            .update(userSubscriptions)
            .set({ status, updatedAt: new Date() })
            .where(eq(userSubscriptions.userId, userId))
            .returning()
          return Option.getOrNull(Option.fromNullable(subscription))
        }),

      updateFromWebhook: (
        externalSubscriptionId: string,
        data: Partial<CreateSubscriptionData>
      ) =>
        Effect.gen(function* () {
          const updateData: Record<string, unknown> = { updatedAt: new Date() }
          if (data.tier !== undefined) updateData.tier = data.tier
          if (data.status !== undefined) updateData.status = data.status
          if (data.trialStartsAt !== undefined)
            updateData.trialStartsAt = data.trialStartsAt
          if (data.trialEndsAt !== undefined)
            updateData.trialEndsAt = data.trialEndsAt
          if (data.currentPeriodStart !== undefined)
            updateData.currentPeriodStart = data.currentPeriodStart
          if (data.currentPeriodEnd !== undefined)
            updateData.currentPeriodEnd = data.currentPeriodEnd
          if (data.externalCustomerId !== undefined)
            updateData.externalCustomerId = data.externalCustomerId
          if (data.productId !== undefined)
            updateData.productId = data.productId
          if (data.store !== undefined) updateData.store = data.store
          if (data.provider !== undefined) updateData.provider = data.provider

          const [subscription] = yield* db
            .update(userSubscriptions)
            .set(updateData)
            .where(
              eq(
                userSubscriptions.externalSubscriptionId,
                externalSubscriptionId
              )
            )
            .returning()
          return Option.getOrNull(Option.fromNullable(subscription))
        }),

      updateByUserId: (userId: string, data: Partial<CreateSubscriptionData>) =>
        Effect.gen(function* () {
          const updateData: Record<string, unknown> = { updatedAt: new Date() }
          if (data.tier !== undefined) updateData.tier = data.tier
          if (data.status !== undefined) updateData.status = data.status
          if (data.trialStartsAt !== undefined)
            updateData.trialStartsAt = data.trialStartsAt
          if (data.trialEndsAt !== undefined)
            updateData.trialEndsAt = data.trialEndsAt
          if (data.currentPeriodStart !== undefined)
            updateData.currentPeriodStart = data.currentPeriodStart
          if (data.currentPeriodEnd !== undefined)
            updateData.currentPeriodEnd = data.currentPeriodEnd
          if (data.externalCustomerId !== undefined)
            updateData.externalCustomerId = data.externalCustomerId
          if (data.externalSubscriptionId !== undefined)
            updateData.externalSubscriptionId = data.externalSubscriptionId
          if (data.productId !== undefined)
            updateData.productId = data.productId
          if (data.store !== undefined) updateData.store = data.store
          if (data.provider !== undefined) updateData.provider = data.provider

          const [subscription] = yield* db
            .update(userSubscriptions)
            .set(updateData)
            .where(eq(userSubscriptions.userId, userId))
            .returning()
          return Option.getOrNull(Option.fromNullable(subscription))
        }),

      cancel: (userId: string) =>
        Effect.gen(function* () {
          const [subscription] = yield* db
            .update(userSubscriptions)
            .set({
              status: 'canceled',
              canceledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(userSubscriptions.userId, userId))
            .returning()
          return Option.getOrNull(Option.fromNullable(subscription))
        }),

      getTier: (tier: SubscriptionTier) =>
        Effect.gen(function* () {
          const result = yield* db
            .select()
            .from(subscriptionTiers)
            .where(eq(subscriptionTiers.tier, tier))

          const config = result[0]

          // If tier not found, return free tier defaults as fallback
          if (!config) {
            return {
              tier: 'free' as const,
              name: 'Free',
              priceMonthly: 0,
              maxPlants: 5,
              maxAiChatsMonthly: 10,
              maxCardScansMonthly: 5,
              maxPlantIdentifiesMonthly: 3,
            } satisfies TierConfig
          }

          return {
            tier: config.tier,
            name: config.name,
            priceMonthly: config.priceMonthly,
            maxPlants: config.maxPlants,
            maxAiChatsMonthly: config.maxAiChatsMonthly,
            maxCardScansMonthly: config.maxCardScansMonthly,
            maxPlantIdentifiesMonthly: config.maxPlantIdentifiesMonthly,
          } satisfies TierConfig
        }),

      getAllTiers: () =>
        Effect.gen(function* () {
          const tiers = yield* db.select().from(subscriptionTiers)
          return Array.map(tiers, (config) => ({
            tier: config.tier,
            name: config.name,
            priceMonthly: config.priceMonthly,
            maxPlants: config.maxPlants,
            maxAiChatsMonthly: config.maxAiChatsMonthly,
            maxCardScansMonthly: config.maxCardScansMonthly,
            maxPlantIdentifiesMonthly: config.maxPlantIdentifiesMonthly,
          })) as TierConfig[]
        }),

      getCurrentUsage: (userId: string) =>
        Effect.gen(function* () {
          const { periodStart, periodEnd } = getMonthBoundaries()

          const [usage] = yield* db
            .select()
            .from(subscriptionUsage)
            .where(
              and(
                eq(subscriptionUsage.userId, userId),
                eq(subscriptionUsage.periodStart, periodStart)
              )
            )

          if (!usage) {
            // Auto-create usage record for current period
            const [newUsage] = yield* db
              .insert(subscriptionUsage)
              .values({
                userId,
                periodStart,
                periodEnd,
                aiChatsCount: 0,
                cardScansCount: 0,
                plantIdentifiesCount: 0,
              })
              .onConflictDoNothing()
              .returning()

            // If conflict, fetch the existing one
            if (!newUsage) {
              const [existing] = yield* db
                .select()
                .from(subscriptionUsage)
                .where(
                  and(
                    eq(subscriptionUsage.userId, userId),
                    eq(subscriptionUsage.periodStart, periodStart)
                  )
                )
              return Option.getOrNull(Option.fromNullable(existing))
            }

            return newUsage
          }

          return usage
        }),

      getOrCreateUsage: (userId: string, periodStart: Date, periodEnd: Date) =>
        Effect.gen(function* () {
          const existingResult = yield* db
            .select()
            .from(subscriptionUsage)
            .where(
              and(
                eq(subscriptionUsage.userId, userId),
                eq(subscriptionUsage.periodStart, periodStart)
              )
            )

          if (existingResult[0]) return existingResult[0]

          const insertResult = yield* db
            .insert(subscriptionUsage)
            .values({
              userId,
              periodStart,
              periodEnd,
              aiChatsCount: 0,
              cardScansCount: 0,
              plantIdentifiesCount: 0,
            })
            .returning()

          // Return the inserted record, or fetch it if not returned
          if (insertResult[0]) return insertResult[0]

          // Fallback: fetch after insert (rare race condition case)
          const fallbackResult = yield* db
            .select()
            .from(subscriptionUsage)
            .where(
              and(
                eq(subscriptionUsage.userId, userId),
                eq(subscriptionUsage.periodStart, periodStart)
              )
            )

          // At this point the record must exist - use default values as ultimate fallback
          return pipe(
            Array.head(fallbackResult),
            Option.getOrElse(() => ({
              id: '',
              userId,
              periodStart,
              periodEnd,
              aiChatsCount: 0,
              cardScansCount: 0,
              plantIdentifiesCount: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            }))
          )
        }),

      incrementUsage: (userId: string, field: UsageField) =>
        Effect.gen(function* () {
          const { periodStart, periodEnd } = getMonthBoundaries()

          // Ensure usage record exists
          yield* db
            .insert(subscriptionUsage)
            .values({
              userId,
              periodStart,
              periodEnd,
              aiChatsCount: 0,
              cardScansCount: 0,
              plantIdentifiesCount: 0,
            })
            .onConflictDoNothing()

          // Map field to column
          const columnMap = {
            aiChats: subscriptionUsage.aiChatsCount,
            cardScans: subscriptionUsage.cardScansCount,
            plantIdentifies: subscriptionUsage.plantIdentifiesCount,
          }

          const column = columnMap[field]

          const [usage] = yield* db
            .update(subscriptionUsage)
            .set({
              [field === 'aiChats'
                ? 'aiChatsCount'
                : field === 'cardScans'
                  ? 'cardScansCount'
                  : 'plantIdentifiesCount']: sql`${column} + 1`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(subscriptionUsage.userId, userId),
                eq(subscriptionUsage.periodStart, periodStart)
              )
            )
            .returning()

          return Option.getOrNull(Option.fromNullable(usage))
        }),

      logEvent: (userId: string, eventType: string, metadata?: object) =>
        Effect.gen(function* () {
          yield* db.insert(subscriptionEvents).values({
            userId,
            eventType:
              eventType as typeof subscriptionEvents.$inferInsert.eventType,
            metadata: metadata ? JSON.stringify(metadata) : null,
          })
        }),
    }
  })
)
