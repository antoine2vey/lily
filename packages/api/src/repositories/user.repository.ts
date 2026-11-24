import { writeAccount } from '@lily/api/kernel/locks'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { users } from '@lily/db/schema'
import {
  type LanguageCode,
  nowAsDate,
  type TimeZone,
  type UserRole,
  type UserStatus,
} from '@lily/shared'
import type { StoredObjectRef } from '@lily/shared/services/file/stored-ref-mint'
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface CreateUserData {
  name?: string
  email: string
  emailVerified?: boolean
  timezone?: TimeZone
  language?: LanguageCode
  firstName?: string | null
  lastName?: string | null
}

export interface UpdateUserData {
  name?: string
  email?: string
  image?: StoredObjectRef | null
  bio?: string | null
  careReminders?: boolean
  weeklyDigest?: boolean
  achievementNotifications?: boolean
  tips?: boolean
  productUpdates?: boolean
  ads?: boolean
  doNotDisturb?: boolean
  doNotDisturbStart?: string | null
  doNotDisturbEnd?: string | null
  emailVerified?: boolean
  role?: UserRole
  status?: UserStatus
  language?: LanguageCode
  timezone?: TimeZone | null
  preferredNotificationTime?: string | null
  weatherEnabled?: boolean
  latitude?: number | null
  longitude?: number | null
  firstName?: string | null
  lastName?: string | null
}

export interface FindUsersFilters {
  page: number
  limit: number
  role?: UserRole
  status?: UserStatus
  search?: string
}

export interface IUserRepository {
  readonly findById: (
    id: string
  ) => Effect.Effect<typeof users.$inferSelect | null, SqlError>
  readonly findByIds: (
    ids: ReadonlyArray<string>
  ) => Effect.Effect<Array<typeof users.$inferSelect>, SqlError>
  readonly findByEmail: (
    email: string
  ) => Effect.Effect<typeof users.$inferSelect | null, SqlError>
  readonly findByUsername: (
    username: string
  ) => Effect.Effect<typeof users.$inferSelect | null, SqlError>
  readonly create: (
    data: CreateUserData
  ) => Effect.Effect<typeof users.$inferSelect | null, SqlError>
  readonly update: (
    id: string,
    data: UpdateUserData
  ) => Effect.Effect<typeof users.$inferSelect | null, SqlError>
  readonly delete: (
    id: string
  ) => Effect.Effect<typeof users.$inferSelect | null, SqlError>
  readonly findAllPaginated: (
    filters: FindUsersFilters
  ) => Effect.Effect<Array<typeof users.$inferSelect>, SqlError>
  readonly countUsers: (
    filters: Omit<FindUsersFilters, 'page' | 'limit'>
  ) => Effect.Effect<number, SqlError>
  readonly updateRole: (
    id: string,
    role: UserRole
  ) => Effect.Effect<typeof users.$inferSelect | null, SqlError>
  readonly updateStatus: (
    id: string,
    status: UserStatus
  ) => Effect.Effect<typeof users.$inferSelect | null, SqlError>
  readonly findWeatherEnabled: Effect.Effect<
    Array<typeof users.$inferSelect>,
    SqlError
  >
  readonly softDelete: (
    id: string
  ) => Effect.Effect<typeof users.$inferSelect | null, SqlError>
  readonly findExpiredDeletions: (
    cutoffDate: Date
  ) => Effect.Effect<Array<typeof users.$inferSelect>, SqlError>
}

const buildUserFilterConditions = (
  filters: Omit<FindUsersFilters, 'page' | 'limit'>
) => {
  const conditions = []
  if (filters.role) conditions.push(eq(users.role, filters.role))
  if (filters.status) conditions.push(eq(users.status, filters.status))
  if (filters.search) {
    conditions.push(
      or(
        ilike(users.email, `%${filters.search}%`),
        ilike(users.name, `%${filters.search}%`)
      )
    )
  }
  return conditions.length > 0 ? and(...conditions) : undefined
}

export class UserRepository extends Context.Service<
  UserRepository,
  IUserRepository
>()('UserRepository') {}

export const UserRepositoryLive = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findById: Effect.fn('UserRepository.findById')(function* (id: string) {
        const [user] = yield* db.select().from(users).where(eq(users.id, id))
        return Option.getOrNull(Option.fromNullishOr(user))
      }),

      findByIds: Effect.fn('UserRepository.findByIds')(function* (
        ids: ReadonlyArray<string>
      ) {
        if (ids.length === 0) return [] as Array<typeof users.$inferSelect>
        return yield* db
          .select()
          .from(users)
          .where(inArray(users.id, [...ids]))
      }),

      findByEmail: Effect.fn('UserRepository.findByEmail')(function* (
        email: string
      ) {
        const [user] = yield* db
          .select()
          .from(users)
          .where(eq(users.email, email))
        return Option.getOrNull(Option.fromNullishOr(user))
      }),

      findByUsername: Effect.fn('UserRepository.findByUsername')(function* (
        username: string
      ) {
        const [user] = yield* db
          .select()
          .from(users)
          .where(sql`lower(${users.name}) = lower(${username})`)
        return Option.getOrNull(Option.fromNullishOr(user))
      }),

      create: Effect.fn('UserRepository.create')(function* (
        data: CreateUserData
      ) {
        const [user] = yield* db
          .insert(users)
          .values({
            ...data,
            emailVerified: pipe(
              Option.fromNullishOr(data.emailVerified),
              Option.getOrElse(() => false)
            ),
          })
          .returning()
        return Option.getOrNull(Option.fromNullishOr(user))
      }),

      update: Effect.fn('UserRepository.update')(function* (
        id: string,
        data: UpdateUserData
      ) {
        const [user] = yield* writeAccount(
          db,
          id,
          { ...data, updatedAt: nowAsDate() },
          (written) => written.returning()
        )
        return Option.getOrNull(Option.fromNullishOr(user))
      }),

      delete: Effect.fn('UserRepository.delete')(function* (id: string) {
        const [user] = yield* db
          .delete(users)
          .where(eq(users.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullishOr(user))
      }),

      softDelete: Effect.fn('UserRepository.softDelete')(function* (
        id: string
      ) {
        const [user] = yield* writeAccount(
          db,
          id,
          {
            status: 'pending_deletion',
            deletedAt: nowAsDate(),
          },
          (written) => written.returning()
        )
        return Option.getOrNull(Option.fromNullishOr(user))
      }),

      findExpiredDeletions: Effect.fn('UserRepository.findExpiredDeletions')(
        function* (cutoffDate: Date) {
          return yield* db
            .select()
            .from(users)
            .where(
              and(
                eq(users.status, 'pending_deletion'),
                lte(users.deletedAt, cutoffDate)
              )
            )
        }
      ),

      findAllPaginated: Effect.fn('UserRepository.findAllPaginated')(function* (
        filters: FindUsersFilters
      ) {
        const { page, limit } = filters
        const offset = (page - 1) * limit

        const whereClause = buildUserFilterConditions(filters)

        const results = yield* db
          .select()
          .from(users)
          .where(whereClause)
          .orderBy(desc(users.createdAt))
          .limit(limit)
          .offset(offset)

        return results
      }),

      countUsers: Effect.fn('UserRepository.countUsers')(function* (
        filters: Omit<FindUsersFilters, 'page' | 'limit'>
      ) {
        const whereClause = buildUserFilterConditions(filters)

        const result = yield* db
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(whereClause)

        return pipe(
          Array.head(result),
          Option.flatMap((r) => Option.fromNullishOr(r.count)),
          Option.getOrElse(() => 0)
        )
      }),

      updateRole: Effect.fn('UserRepository.updateRole')(function* (
        id: string,
        role: UserRole
      ) {
        const [user] = yield* writeAccount(
          db,
          id,
          { role, updatedAt: nowAsDate() },
          (written) => written.returning()
        )
        return Option.getOrNull(Option.fromNullishOr(user))
      }),

      updateStatus: Effect.fn('UserRepository.updateStatus')(function* (
        id: string,
        status: UserStatus
      ) {
        const [user] = yield* writeAccount(
          db,
          id,
          { status, updatedAt: nowAsDate() },
          (written) => written.returning()
        )
        return Option.getOrNull(Option.fromNullishOr(user))
      }),

      findWeatherEnabled: Effect.suspend(() =>
        db
          .select()
          .from(users)
          .where(
            and(
              eq(users.weatherEnabled, true),
              isNotNull(users.latitude),
              isNotNull(users.longitude)
            )
          )
      ).pipe(Effect.withSpan('UserRepository.findWeatherEnabled')),
    }
  })
)
