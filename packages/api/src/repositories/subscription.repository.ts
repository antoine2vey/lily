import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  subscriptionEvents,
  subscriptionTiers,
  subscriptionUsage,
  userSubscriptions,
} from '@lily/db/schema'
import {
  compact,
  endOfMonthAsDate,
  nowAsDate,
  type SubscriptionEventType,
  type SubscriptionStatus,
  type SubscriptionTier,
  startOfMonthAsDate,
  type TierConfig,
  type UsageField,
} from '@lily/shared'
import { and, eq, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Match, Option, pipe } from 'effect'

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
    eventType: SubscriptionEventType,
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

    const getMonthBoundaries = () => ({
      periodStart: startOfMonthAsDate(),
      periodEnd: endOfMonthAsDate(),
    })

    return {
      findByUserId: (userId: string) =>
        Effect.gen(function* () {
          const [subscription] = yield* db
            .select()
            .from(userSubscriptions)
            .where(eq(userSubscriptions.userId, userId))
          return Option.getOrNull(Option.fromNullable(subscription))
        }).pipe(Effect.withSpan('SubscriptionRepository.findByUserId')),

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
        }).pipe(Effect.withSpan('SubscriptionRepository.findByExternalId')),

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
                updatedAt: nowAsDate(),
              },
            })
            .returning()
          return Option.getOrNull(Option.fromNullable(subscription))
        }).pipe(Effect.withSpan('SubscriptionRepository.create')),

      updateStatus: (userId: string, status: SubscriptionStatus) =>
        Effect.gen(function* () {
          const [subscription] = yield* db
            .update(userSubscriptions)
            .set({ status, updatedAt: nowAsDate() })
            .where(eq(userSubscriptions.userId, userId))
            .returning()
          return Option.getOrNull(Option.fromNullable(subscription))
        }).pipe(Effect.withSpan('SubscriptionRepository.updateStatus')),

      updateFromWebhook: (
        externalSubscriptionId: string,
        data: Partial<CreateSubscriptionData>
      ) =>
        Effect.gen(function* () {
          const updateData = compact(data, { updatedAt: nowAsDate() })

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
        }).pipe(Effect.withSpan('SubscriptionRepository.updateFromWebhook')),

      updateByUserId: (userId: string, data: Partial<CreateSubscriptionData>) =>
        Effect.gen(function* () {
          const updateData = compact(data, { updatedAt: nowAsDate() })

          const [subscription] = yield* db
            .update(userSubscriptions)
            .set(updateData)
            .where(eq(userSubscriptions.userId, userId))
            .returning()
          return Option.getOrNull(Option.fromNullable(subscription))
        }).pipe(Effect.withSpan('SubscriptionRepository.updateByUserId')),

      cancel: (userId: string) =>
        Effect.gen(function* () {
          const [subscription] = yield* db
            .update(userSubscriptions)
            .set({
              status: 'canceled',
              canceledAt: nowAsDate(),
              updatedAt: nowAsDate(),
            })
            .where(eq(userSubscriptions.userId, userId))
            .returning()
          return Option.getOrNull(Option.fromNullable(subscription))
        }).pipe(Effect.withSpan('SubscriptionRepository.cancel')),

      getTier: (tier: SubscriptionTier) =>
        Effect.gen(function* () {
          const result = yield* db
            .select()
            .from(subscriptionTiers)
            .where(eq(subscriptionTiers.tier, tier))

          return pipe(
            Array.head(result),
            Option.match({
              onNone: () =>
                ({
                  tier: 'free' as const,
                  name: 'Free',
                  priceMonthly: 0,
                  maxPlants: 5,
                  maxAiChatsMonthly: 10,
                  maxCardScansMonthly: 5,
                  maxPlantIdentifiesMonthly: 3,
                }) satisfies TierConfig,
              onSome: (config) =>
                ({
                  tier: config.tier,
                  name: config.name,
                  priceMonthly: config.priceMonthly,
                  maxPlants: config.maxPlants,
                  maxAiChatsMonthly: config.maxAiChatsMonthly,
                  maxCardScansMonthly: config.maxCardScansMonthly,
                  maxPlantIdentifiesMonthly: config.maxPlantIdentifiesMonthly,
                }) satisfies TierConfig,
            })
          )
        }).pipe(Effect.withSpan('SubscriptionRepository.getTier')),

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
        }).pipe(Effect.withSpan('SubscriptionRepository.getAllTiers')),

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
        }).pipe(Effect.withSpan('SubscriptionRepository.getCurrentUsage')),

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

          const existing = Array.head(existingResult)
          if (Option.isSome(existing)) return existing.value

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
          const inserted = Array.head(insertResult)
          if (Option.isSome(inserted)) return inserted.value

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
              createdAt: nowAsDate(),
              updatedAt: nowAsDate(),
            }))
          )
        }).pipe(Effect.withSpan('SubscriptionRepository.getOrCreateUsage')),

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

          // Map field to column and column name using Match
          const { column, columnName } = pipe(
            Match.value(field),
            Match.when('aiChats', () => ({
              column: subscriptionUsage.aiChatsCount,
              columnName: 'aiChatsCount' as const,
            })),
            Match.when('cardScans', () => ({
              column: subscriptionUsage.cardScansCount,
              columnName: 'cardScansCount' as const,
            })),
            Match.when('plantIdentifies', () => ({
              column: subscriptionUsage.plantIdentifiesCount,
              columnName: 'plantIdentifiesCount' as const,
            })),
            Match.exhaustive
          )

          const [usage] = yield* db
            .update(subscriptionUsage)
            .set({
              [columnName]: sql`${column} + 1`,
              updatedAt: nowAsDate(),
            })
            .where(
              and(
                eq(subscriptionUsage.userId, userId),
                eq(subscriptionUsage.periodStart, periodStart)
              )
            )
            .returning()

          return Option.getOrNull(Option.fromNullable(usage))
        }).pipe(Effect.withSpan('SubscriptionRepository.incrementUsage')),

      logEvent: (
        userId: string,
        eventType: SubscriptionEventType,
        metadata?: object
      ) =>
        Effect.gen(function* () {
          yield* db.insert(subscriptionEvents).values({
            userId,
            eventType,
            metadata: metadata ? JSON.stringify(metadata) : null,
          })
        }).pipe(Effect.withSpan('SubscriptionRepository.logEvent')),
    }
  })
)
