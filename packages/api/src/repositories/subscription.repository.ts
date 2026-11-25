import { pinAccounts } from '@lily/api/kernel/locks'
import type { Transaction } from '@lily/api/kernel/transact'
import { expectWritten } from '@lily/api/kernel/written'
import { getPaginationParams } from '@lily/api/repositories/helpers/pagination'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  revenuecatWebhookEvents,
  subscriptionEvents,
  subscriptionTiers,
  subscriptionUsage,
  usageReservations,
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
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  ne,
  sql,
} from 'drizzle-orm'
import {
  Array,
  Context,
  Data,
  Effect,
  Layer,
  Match,
  Option,
  pipe,
  Schema,
} from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

// `users.id` is a uuid, and Postgres refuses to compare it with any other text,
// such as the anonymous id RevenueCat gives a customer before they sign in.
const isAccountId = Schema.is(Schema.String.check(Schema.isUUID()))

export const ReservationId = Schema.String.pipe(Schema.brand('ReservationId'))
export type ReservationId = typeof ReservationId.Type

// Rolls back the unit a refund gave back when a charge, or another refund,
// took the reservation between the refund's read and its move.
class ReservationSettledMeanwhile extends Data.TaggedError(
  'ReservationSettledMeanwhile'
) {}

/** The usage row after the unit was counted, and the reservation holding it. */
export interface ReservedUsage {
  readonly reservationId: ReservationId
  readonly usage: typeof subscriptionUsage.$inferSelect
}

export interface CreateSubscriptionData {
  userId: string
  tier: SubscriptionTier
  status: SubscriptionStatus
  trialStartsAt?: Date | null
  trialEndsAt?: Date | null
  currentPeriodStart: Date
  currentPeriodEnd: Date
  // Left undefined, an upsert keeps the row's current canceledAt.
  canceledAt?: Date | null
  externalSubscriptionId?: string | null
  externalCustomerId?: string | null
  provider?: 'revenuecat'
  productId?: string | null
  store?: 'APP_STORE' | 'PLAY_STORE' | null
}

export interface RevenueCatWebhookEventRecord {
  id: string
  eventType: string
  appUserId: string
  environment: string
}

export type WebhookEventClaim = 'recorded' | 'redelivered' | 'no_account'

export interface ISubscriptionRepository {
  readonly findByUserId: (
    userId: string
  ) => Effect.Effect<typeof userSubscriptions.$inferSelect | null, SqlError>

  readonly findByUserIds: (
    userIds: readonly string[]
  ) => Effect.Effect<
    ReadonlyArray<typeof userSubscriptions.$inferSelect>,
    SqlError
  >

  // Rows linked to a store purchase (gifts and free rows have no external id)
  readonly findStoreSubscriptions: Effect.Effect<
    ReadonlyArray<typeof userSubscriptions.$inferSelect>,
    SqlError
  >

  /**
   * Holds the account until the transaction ends, so no deletion of it can
   * start between two writes that name it. False when the account is gone,
   * or when `userId` cannot be the id of one.
   */
  readonly holdAccount: (
    userId: string
  ) => Effect.Effect<boolean, SqlError, Transaction>

  /**
   * Records a RevenueCat event id under a hold of its account, so a purge
   * either finds the row or commits first and leaves nothing to record.
   */
  readonly claimWebhookEvent: (
    event: RevenueCatWebhookEventRecord
  ) => Effect.Effect<WebhookEventClaim, SqlError, Transaction>

  // The events have no foreign key to users, so the account purge calls this.
  readonly deleteWebhookEvents: (
    userId: string
  ) => Effect.Effect<void, SqlError>

  readonly create: (
    data: CreateSubscriptionData
  ) => Effect.Effect<typeof userSubscriptions.$inferSelect | null, SqlError>

  readonly updateByUserId: (
    userId: string,
    data: Partial<CreateSubscriptionData>
  ) => Effect.Effect<typeof userSubscriptions.$inferSelect | null, SqlError>

  readonly getTier: (
    tier: SubscriptionTier
  ) => Effect.Effect<TierConfig, SqlError>

  readonly getAllTiers: Effect.Effect<TierConfig[], SqlError>

  readonly getCurrentUsage: (
    userId: string
  ) => Effect.Effect<typeof subscriptionUsage.$inferSelect | null, SqlError>

  /**
   * Atomically takes one unit of `field` for the current month and records
   * it as a `reserved` reservation, in one transaction. Returns `null` when
   * `limit` is already reached. A `null` limit never refuses.
   */
  readonly reserveUsage: (
    userId: string,
    field: UsageField,
    limit: number | null
  ) => Effect.Effect<ReservedUsage | null, SqlError>

  /**
   * Moves a `reserved` reservation to `refunded` and gives its unit back to
   * the row it was counted on, in one transaction, even after the month has
   * rolled over. Answers `false` and changes nothing when the reservation
   * already left `reserved`, so a second refund never takes another unit.
   */
  readonly releaseUsage: (
    reservationId: ReservationId
  ) => Effect.Effect<boolean, SqlError>

  /**
   * Moves a `reserved` reservation to `charged`, which keeps its unit
   * counted. Answers `false` when it already left `reserved`.
   */
  readonly chargeUsage: (
    reservationId: ReservationId
  ) => Effect.Effect<boolean, SqlError>

  /** The reservations still `reserved` that were taken before `before`. */
  readonly findReservedBefore: (
    before: Date
  ) => Effect.Effect<ReadonlyArray<ReservationId>, SqlError>

  /**
   * Deletes the settled reservations of every period that ended before
   * `closedBefore`. Returns how many it deleted.
   */
  readonly deleteSettledReservations: (
    closedBefore: Date
  ) => Effect.Effect<number, SqlError>

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

  readonly logEvent: (
    userId: string,
    eventType: SubscriptionEventType,
    metadata?: object
  ) => Effect.Effect<void, SqlError>
}

export class SubscriptionRepository extends Context.Service<
  SubscriptionRepository,
  ISubscriptionRepository
>()('SubscriptionRepository') {}

export const SubscriptionRepositoryLive = Layer.effect(
  SubscriptionRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    const client = yield* SqlClient.SqlClient

    const holdAccount = Effect.fn('SubscriptionRepository.holdAccount')(
      function* (userId: string) {
        if (!isAccountId(userId)) return false
        const held = yield* pinAccounts(
          db.select({ id: users.id }).from(users).where(eq(users.id, userId))
        )
        return Array.isReadonlyArrayNonEmpty(held)
      }
    )

    const getMonthBoundaries = () => ({
      periodStart: startOfMonthAsDate(),
      periodEnd: endOfMonthAsDate(),
    })

    const usageColumn = (field: UsageField) =>
      pipe(
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

    // The WHERE on `reserved` is re-evaluated on the locked row, so of a
    // refund and a charge racing for one reservation exactly one gets it.
    const leaveReserved = (
      reservationId: ReservationId,
      state: 'charged' | 'refunded'
    ) =>
      db
        .update(usageReservations)
        .set({ state, settledAt: nowAsDate() })
        .where(
          and(
            eq(usageReservations.id, reservationId),
            eq(usageReservations.state, 'reserved')
          )
        )
        .returning({
          usageId: usageReservations.usageId,
          field: usageReservations.field,
        })

    return {
      findByUserId: Effect.fn('SubscriptionRepository.findByUserId')(function* (
        userId: string
      ) {
        const [subscription] = yield* db
          .select()
          .from(userSubscriptions)
          .where(eq(userSubscriptions.userId, userId))
        return Option.getOrNull(Option.fromNullishOr(subscription))
      }),

      findByUserIds: Effect.fn('SubscriptionRepository.findByUserIds')(
        function* (userIds: readonly string[]) {
          if (Array.isReadonlyArrayEmpty(userIds)) return []
          return yield* db
            .select()
            .from(userSubscriptions)
            .where(inArray(userSubscriptions.userId, [...userIds]))
        }
      ),

      findStoreSubscriptions: Effect.suspend(() =>
        db
          .select()
          .from(userSubscriptions)
          .where(isNotNull(userSubscriptions.externalSubscriptionId))
      ).pipe(Effect.withSpan('SubscriptionRepository.findStoreSubscriptions')),

      holdAccount,

      claimWebhookEvent: Effect.fn('SubscriptionRepository.claimWebhookEvent')(
        function* (event: RevenueCatWebhookEventRecord) {
          if (!(yield* holdAccount(event.appUserId))) return 'no_account'
          const inserted = yield* db
            .insert(revenuecatWebhookEvents)
            .values(event)
            .onConflictDoNothing()
            .returning({ id: revenuecatWebhookEvents.id })
          return Array.isReadonlyArrayNonEmpty(inserted)
            ? 'recorded'
            : 'redelivered'
        }
      ),

      deleteWebhookEvents: Effect.fn(
        'SubscriptionRepository.deleteWebhookEvents'
      )(function* (userId: string) {
        yield* db
          .delete(revenuecatWebhookEvents)
          .where(eq(revenuecatWebhookEvents.appUserId, userId))
      }),

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
              Option.fromNullishOr(data.trialStartsAt)
            ),
            trialEndsAt: Option.getOrNull(
              Option.fromNullishOr(data.trialEndsAt)
            ),
            currentPeriodStart: data.currentPeriodStart,
            currentPeriodEnd: data.currentPeriodEnd,
            canceledAt: Option.getOrNull(Option.fromNullishOr(data.canceledAt)),
            externalSubscriptionId: Option.getOrNull(
              Option.fromNullishOr(data.externalSubscriptionId)
            ),
            externalCustomerId: Option.getOrNull(
              Option.fromNullishOr(data.externalCustomerId)
            ),
            provider: pipe(
              Option.fromNullishOr(data.provider),
              Option.getOrElse(() => 'revenuecat' as const)
            ),
            productId: Option.getOrNull(Option.fromNullishOr(data.productId)),
            store: Option.getOrNull(Option.fromNullishOr(data.store)),
          })
          .onConflictDoUpdate({
            target: userSubscriptions.userId,
            set: {
              ...compact({ canceledAt: data.canceledAt }),
              tier: data.tier,
              status: data.status,
              trialStartsAt: Option.getOrNull(
                Option.fromNullishOr(data.trialStartsAt)
              ),
              trialEndsAt: Option.getOrNull(
                Option.fromNullishOr(data.trialEndsAt)
              ),
              currentPeriodStart: data.currentPeriodStart,
              currentPeriodEnd: data.currentPeriodEnd,
              externalSubscriptionId: Option.getOrNull(
                Option.fromNullishOr(data.externalSubscriptionId)
              ),
              externalCustomerId: Option.getOrNull(
                Option.fromNullishOr(data.externalCustomerId)
              ),
              provider: pipe(
                Option.fromNullishOr(data.provider),
                Option.getOrElse(() => 'revenuecat' as const)
              ),
              productId: Option.getOrNull(Option.fromNullishOr(data.productId)),
              store: Option.getOrNull(Option.fromNullishOr(data.store)),
              updatedAt: nowAsDate(),
            },
          })
          .returning()
        return Option.getOrNull(Option.fromNullishOr(subscription))
      }),

      updateByUserId: Effect.fn('SubscriptionRepository.updateByUserId')(
        function* (userId: string, data: Partial<CreateSubscriptionData>) {
          const updateData = compact(data, { updatedAt: nowAsDate() })

          const [subscription] = yield* db
            .update(userSubscriptions)
            .set(updateData)
            .where(eq(userSubscriptions.userId, userId))
            .returning()
          return Option.getOrNull(Option.fromNullishOr(subscription))
        }
      ),

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

      getAllTiers: Effect.gen(function* () {
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
              return Option.getOrNull(Option.fromNullishOr(existing))
            }

            return newUsage
          }

          return usage
        }
      ),

      reserveUsage: Effect.fn('SubscriptionRepository.reserveUsage')(function* (
        userId: string,
        field: UsageField,
        limit: number | null
      ) {
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

        const { column, columnName } = usageColumn(field)

        // The row lock serializes concurrent reservations and Postgres
        // re-evaluates the WHERE on the locked row, so at most `limit`
        // reservations succeed per period.
        const [usage] = yield* db
          .update(subscriptionUsage)
          .set({
            [columnName]: sql`${column} + 1`,
            updatedAt: nowAsDate(),
          })
          .where(
            and(
              eq(subscriptionUsage.userId, userId),
              eq(subscriptionUsage.periodStart, periodStart),
              pipe(
                Option.fromNullishOr(limit),
                Option.map((max) => sql`${column} < ${max}`),
                Option.getOrUndefined
              )
            )
          )
          .returning()
        if (!usage) return null

        const reservationId = ReservationId.make(crypto.randomUUID())
        yield* db
          .insert(usageReservations)
          .values({
            id: reservationId,
            usageId: usage.id,
            field,
            createdAt: nowAsDate(),
          })
          .returning({ id: usageReservations.id })
          .pipe(
            Effect.flatMap(
              expectWritten(usageReservations, { _tag: 'ReserveUsage' })
            )
          )

        return { reservationId, usage } satisfies ReservedUsage
      }, client.withTransaction),

      releaseUsage: Effect.fn('SubscriptionRepository.releaseUsage')(function* (
        reservationId: ReservationId
      ) {
        const [reservation] = yield* db
          .select({
            usageId: usageReservations.usageId,
            field: usageReservations.field,
          })
          .from(usageReservations)
          .where(
            and(
              eq(usageReservations.id, reservationId),
              eq(usageReservations.state, 'reserved')
            )
          )
        if (!reservation) return false

        // The usage row is written first, the order reserveUsage and the
        // cascade of an account deletion take it in, and written once: a
        // second update of a row this transaction already wrote checks its
        // foreign key to `users` again and waits for the deletion. Either
        // other order deadlocks with a deletion of the account.
        const { column, columnName } = usageColumn(reservation.field)
        return yield* db
          .update(subscriptionUsage)
          .set({
            [columnName]: sql`GREATEST(${column} - 1, 0)`,
            updatedAt: nowAsDate(),
          })
          .where(eq(subscriptionUsage.id, reservation.usageId))
          .pipe(
            Effect.andThen(leaveReserved(reservationId, 'refunded')),
            Effect.filterOrFail(
              Array.isArrayNonEmpty,
              () => new ReservationSettledMeanwhile()
            ),
            Effect.as(true),
            client.withTransaction,
            Effect.catchTag('ReservationSettledMeanwhile', () =>
              Effect.succeed(false)
            )
          )
      }),

      chargeUsage: Effect.fn('SubscriptionRepository.chargeUsage')(function* (
        reservationId: ReservationId
      ) {
        const charged = yield* leaveReserved(reservationId, 'charged')
        return Array.isArrayNonEmpty(charged)
      }),

      findReservedBefore: Effect.fn(
        'SubscriptionRepository.findReservedBefore'
      )(function* (before: Date) {
        const rows = yield* db
          .select({ id: usageReservations.id })
          .from(usageReservations)
          .where(
            and(
              eq(usageReservations.state, 'reserved'),
              lt(usageReservations.createdAt, before)
            )
          )
          .orderBy(asc(usageReservations.createdAt))
        return Array.map(rows, (row) => ReservationId.make(row.id))
      }),

      deleteSettledReservations: Effect.fn(
        'SubscriptionRepository.deleteSettledReservations'
      )(function* (closedBefore: Date) {
        const deleted = yield* db
          .delete(usageReservations)
          .where(
            and(
              ne(usageReservations.state, 'reserved'),
              inArray(
                usageReservations.usageId,
                db
                  .select({ id: subscriptionUsage.id })
                  .from(subscriptionUsage)
                  .where(lt(subscriptionUsage.periodEnd, closedBefore))
              )
            )
          )
          .returning({ id: usageReservations.id })
        return deleted.length
      }),

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
