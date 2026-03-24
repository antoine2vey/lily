import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { getPaginationParams } from '@lily/api/repositories/helpers/pagination'
import {
  subscriptionEvents,
  subscriptionTiers,
  subscriptionUsage,
  userSubscriptions,
  users,
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
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import {
  Array,
  Context,
  Effect,
  Layer,
  Match,
  Option,
  pipe,
  Schema,
} from 'effect'

const encodeJson = Schema.encodeSync(Schema.parseJson(Schema.Unknown))

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

  // Gift history
  readonly findGiftEvents: (params: {
    page: number
    limit: number
  }) => Effect.Effect<
    {
      items: Array<{
        id: string
        userId: string
        userName: string | null
        userEmail: string
        eventType: SubscriptionEventType
        metadata: string | null
        createdAt: Date
      }>
      total: number
    },
    SqlError
  >

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
      findByUserId: Effect.fn('SubscriptionRepository.findByUserId')(function* (
        userId: string
      ) {
        const [subscription] = yield* db
          .select()
          .from(userSubscriptions)
          .where(eq(userSubscriptions.userId, userId))
        return Option.getOrNull(Option.fromNullable(subscription))
      }),

      findByExternalId: Effect.fn('SubscriptionRepository.findByExternalId')(
        function* (externalSubscriptionId: string) {
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
        }
      ),

      create: Effect.fn('SubscriptionRepository.create')(function* (
        data: CreateSubscriptionData
      ) {
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
              productId: Option.getOrNull(Option.fromNullable(data.productId)),
              store: Option.getOrNull(Option.fromNullable(data.store)),
              updatedAt: nowAsDate(),
            },
          })
          .returning()
        return Option.getOrNull(Option.fromNullable(subscription))
      }),

      updateStatus: Effect.fn('SubscriptionRepository.updateStatus')(function* (
        userId: string,
        status: SubscriptionStatus
      ) {
        const [subscription] = yield* db
          .update(userSubscriptions)
          .set({ status, updatedAt: nowAsDate() })
          .where(eq(userSubscriptions.userId, userId))
          .returning()
        return Option.getOrNull(Option.fromNullable(subscription))
      }),

      updateFromWebhook: Effect.fn('SubscriptionRepository.updateFromWebhook')(
        function* (
          externalSubscriptionId: string,
          data: Partial<CreateSubscriptionData>
        ) {
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
        }
      ),

      updateByUserId: Effect.fn('SubscriptionRepository.updateByUserId')(
        function* (userId: string, data: Partial<CreateSubscriptionData>) {
          const updateData = compact(data, { updatedAt: nowAsDate() })

          const [subscription] = yield* db
            .update(userSubscriptions)
            .set(updateData)
            .where(eq(userSubscriptions.userId, userId))
            .returning()
          return Option.getOrNull(Option.fromNullable(subscription))
        }
      ),

      cancel: Effect.fn('SubscriptionRepository.cancel')(function* (
        userId: string
      ) {
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
      }),

      getTier: Effect.fn('SubscriptionRepository.getTier')(function* (
        tier: SubscriptionTier
      ) {
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
      }),

      getAllTiers: Effect.fn('SubscriptionRepository.getAllTiers')(
        function* () {
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
        }
      ),

      getCurrentUsage: Effect.fn('SubscriptionRepository.getCurrentUsage')(
        function* (userId: string) {
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
        }
      ),

      getOrCreateUsage: Effect.fn('SubscriptionRepository.getOrCreateUsage')(
        function* (userId: string, periodStart: Date, periodEnd: Date) {
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

          const inserted = Array.head(insertResult)
          if (Option.isSome(inserted)) return inserted.value

          const fallbackResult = yield* db
            .select()
            .from(subscriptionUsage)
            .where(
              and(
                eq(subscriptionUsage.userId, userId),
                eq(subscriptionUsage.periodStart, periodStart)
              )
            )

          return Option.getOrThrowWith(
            Array.head(fallbackResult),
            () => new Error('Failed to create or retrieve usage record')
          )
        }
      ),

      incrementUsage: Effect.fn('SubscriptionRepository.incrementUsage')(
        function* (userId: string, field: UsageField) {
          const { periodStart, periodEnd } = getMonthBoundaries()

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
        }
      ),

      findGiftEvents: Effect.fn('SubscriptionRepository.findGiftEvents')(
        function* (params: { page: number; limit: number }) {
          const { offset } = getPaginationParams(params)
          const giftEventTypes = [
            'subscription_gifted',
            'subscription_gift_revoked',
          ] as const

          const [items, [totalRow]] = yield* Effect.all([
            db
              .select({
                id: subscriptionEvents.id,
                userId: subscriptionEvents.userId,
                userName: users.name,
                userEmail: users.email,
                eventType: subscriptionEvents.eventType,
                metadata: subscriptionEvents.metadata,
                createdAt: subscriptionEvents.createdAt,
              })
              .from(subscriptionEvents)
              .innerJoin(users, eq(subscriptionEvents.userId, users.id))
              .where(inArray(subscriptionEvents.eventType, giftEventTypes))
              .orderBy(desc(subscriptionEvents.createdAt))
              .limit(params.limit)
              .offset(offset),
            db
              .select({ total: count() })
              .from(subscriptionEvents)
              .where(inArray(subscriptionEvents.eventType, giftEventTypes)),
          ])

          return {
            items,
            total: totalRow?.total ?? 0,
          }
        }
      ),

      logEvent: Effect.fn('SubscriptionRepository.logEvent')(function* (
        userId: string,
        eventType: SubscriptionEventType,
        metadata?: object
      ) {
        yield* db.insert(subscriptionEvents).values({
          userId,
          eventType,
          metadata: metadata ? encodeJson(metadata) : null,
        })
      }),
    }
  })
)
