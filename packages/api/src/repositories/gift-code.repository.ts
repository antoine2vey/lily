import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  extractCount,
  getPaginationParams,
  type PaginationInput,
} from '@lily/api/repositories/helpers/pagination'
import { giftCodeRedemptions, giftCodes, users } from '@lily/db/schema'
import { compact } from '@lily/shared'
import type { GiftDuration } from '@lily/shared/admin'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { Context, Effect, Layer, Option, String as Str } from 'effect'

export type GiftCodeRecord = Omit<typeof giftCodes.$inferSelect, 'duration'> & {
  duration: GiftDuration
}

export interface CreateGiftCodeData {
  code: string
  duration: GiftDuration
  maxUsages: number
  expiresAt?: Date | null | undefined
}

export interface UpdateGiftCodeData {
  code?: string | undefined
  duration?: GiftDuration | undefined
  maxUsages?: number | undefined
  isActive?: boolean | undefined
  expiresAt?: Date | null | undefined
}

export interface IGiftCodeRepository {
  readonly create: (
    data: CreateGiftCodeData
  ) => Effect.Effect<GiftCodeRecord, SqlError>

  readonly findById: (
    id: string
  ) => Effect.Effect<GiftCodeRecord | null, SqlError>

  readonly findByCode: (
    code: string
  ) => Effect.Effect<GiftCodeRecord | null, SqlError>

  readonly findAll: (
    params: PaginationInput
  ) => Effect.Effect<
    { items: ReadonlyArray<GiftCodeRecord>; total: number },
    SqlError
  >

  readonly update: (
    id: string,
    data: UpdateGiftCodeData
  ) => Effect.Effect<GiftCodeRecord | null, SqlError>

  readonly remove: (
    id: string
  ) => Effect.Effect<GiftCodeRecord | null, SqlError>

  readonly incrementUsage: (id: string) => Effect.Effect<void, SqlError>

  readonly createRedemption: (
    giftCodeId: string,
    userId: string
  ) => Effect.Effect<typeof giftCodeRedemptions.$inferSelect, SqlError>

  readonly findRedemption: (
    giftCodeId: string,
    userId: string
  ) => Effect.Effect<typeof giftCodeRedemptions.$inferSelect | null, SqlError>

  readonly findRedemptionsByCode: (
    giftCodeId: string,
    params: PaginationInput
  ) => Effect.Effect<
    {
      items: ReadonlyArray<{
        id: string
        giftCodeId: string
        userId: string
        userName: string | null
        userEmail: string
        redeemedAt: Date
      }>
      total: number
    },
    SqlError
  >
}

export class GiftCodeRepository extends Context.Tag('GiftCodeRepository')<
  GiftCodeRepository,
  IGiftCodeRepository
>() {}

// Drizzle infers pgEnum as `string` — safely narrow to the known literal union
const asRecord = (row: typeof giftCodes.$inferSelect): GiftCodeRecord =>
  row as unknown as GiftCodeRecord

export const GiftCodeRepositoryLive = Layer.effect(
  GiftCodeRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      create: Effect.fn('GiftCodeRepository.create')(function* (
        data: CreateGiftCodeData
      ) {
        const rows = yield* db
          .insert(giftCodes)
          .values({
            code: Str.toUpperCase(data.code),
            duration: data.duration,
            maxUsages: data.maxUsages,
            expiresAt: data.expiresAt ?? null,
          })
          .returning()
        // biome-ignore lint/style/noNonNullAssertion: returning() guarantees a row
        return asRecord(rows[0]!)
      }),

      findById: Effect.fn('GiftCodeRepository.findById')(function* (
        id: string
      ) {
        const [found] = yield* db
          .select()
          .from(giftCodes)
          .where(eq(giftCodes.id, id))
        return found ? asRecord(found) : null
      }),

      findByCode: Effect.fn('GiftCodeRepository.findByCode')(function* (
        code: string
      ) {
        const [found] = yield* db
          .select()
          .from(giftCodes)
          .where(eq(giftCodes.code, Str.toUpperCase(code)))
        return found ? asRecord(found) : null
      }),

      findAll: Effect.fn('GiftCodeRepository.findAll')(function* (
        params: PaginationInput
      ) {
        const { offset, limit } = getPaginationParams(params)

        const [items, totalResult] = yield* Effect.all([
          db
            .select()
            .from(giftCodes)
            .orderBy(desc(giftCodes.createdAt))
            .limit(limit)
            .offset(offset),
          db.select({ value: count() }).from(giftCodes),
        ])

        return {
          items: items.map(asRecord),
          total: extractCount(totalResult),
        }
      }),

      update: Effect.fn('GiftCodeRepository.update')(function* (
        id: string,
        data: UpdateGiftCodeData
      ) {
        const values = compact({
          code:
            data.code !== undefined ? Str.toUpperCase(data.code) : undefined,
          duration: data.duration,
          maxUsages: data.maxUsages,
          isActive: data.isActive,
          expiresAt: data.expiresAt,
        })

        const [updated] = yield* db
          .update(giftCodes)
          .set(values)
          .where(eq(giftCodes.id, id))
          .returning()
        return updated ? asRecord(updated) : null
      }),

      remove: Effect.fn('GiftCodeRepository.remove')(function* (id: string) {
        const [deleted] = yield* db
          .delete(giftCodes)
          .where(eq(giftCodes.id, id))
          .returning()
        return deleted ? asRecord(deleted) : null
      }),

      incrementUsage: Effect.fn('GiftCodeRepository.incrementUsage')(function* (
        id: string
      ) {
        yield* db
          .update(giftCodes)
          .set({
            currentUsages: sql`${giftCodes.currentUsages} + 1`,
          })
          .where(eq(giftCodes.id, id))
      }),

      createRedemption: Effect.fn('GiftCodeRepository.createRedemption')(
        function* (giftCodeId: string, userId: string) {
          const rows = yield* db
            .insert(giftCodeRedemptions)
            .values({ giftCodeId, userId })
            .returning()
          // biome-ignore lint/style/noNonNullAssertion: returning() guarantees a row
          return rows[0]!
        }
      ),

      findRedemption: Effect.fn('GiftCodeRepository.findRedemption')(function* (
        giftCodeId: string,
        userId: string
      ) {
        const [found] = yield* db
          .select()
          .from(giftCodeRedemptions)
          .where(
            and(
              eq(giftCodeRedemptions.giftCodeId, giftCodeId),
              eq(giftCodeRedemptions.userId, userId)
            )
          )
        return Option.getOrNull(Option.fromNullable(found))
      }),

      findRedemptionsByCode: Effect.fn(
        'GiftCodeRepository.findRedemptionsByCode'
      )(function* (giftCodeId: string, params: PaginationInput) {
        const { offset, limit } = getPaginationParams(params)

        const [items, totalResult] = yield* Effect.all([
          db
            .select({
              id: giftCodeRedemptions.id,
              giftCodeId: giftCodeRedemptions.giftCodeId,
              userId: giftCodeRedemptions.userId,
              userName: users.name,
              userEmail: users.email,
              redeemedAt: giftCodeRedemptions.redeemedAt,
            })
            .from(giftCodeRedemptions)
            .innerJoin(users, eq(giftCodeRedemptions.userId, users.id))
            .where(eq(giftCodeRedemptions.giftCodeId, giftCodeId))
            .orderBy(desc(giftCodeRedemptions.redeemedAt))
            .limit(limit)
            .offset(offset),
          db
            .select({ value: count() })
            .from(giftCodeRedemptions)
            .where(eq(giftCodeRedemptions.giftCodeId, giftCodeId)),
        ])

        return { items, total: extractCount(totalResult) }
      }),
    } satisfies IGiftCodeRepository
  })
)
