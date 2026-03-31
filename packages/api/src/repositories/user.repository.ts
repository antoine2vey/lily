import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { users } from '@lily/db/schema'
import {
  type LanguageCode,
  nowAsDate,
  type UserRole,
  type UserStatus,
} from '@lily/shared'
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

// Types for repository methods
export interface CreateUserData {
  name?: string
  email: string
  emailVerified?: boolean
  timezone?: string
  language?: LanguageCode
}

export interface UpdateUserData {
  name?: string
  email?: string
  image?: string | null
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
  timezone?: string | null
  preferredNotificationTime?: string | null
  weatherEnabled?: boolean
  latitude?: number | null
  longitude?: number | null
}

export interface FindUsersFilters {
  page: number
  limit: number
  role?: UserRole
  status?: UserStatus
  search?: string
}

// Repository service interface
export interface IUserRepository {
  readonly findAll: () => Effect.Effect<
    Array<typeof users.$inferSelect>,
    SqlError
  >
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
  readonly findWeatherEnabled: () => Effect.Effect<
    Array<typeof users.$inferSelect>,
    SqlError
  >
  readonly findTipsEnabled: () => Effect.Effect<
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

// Tag for dependency injection
export class UserRepository extends Context.Tag('UserRepository')<
  UserRepository,
  IUserRepository
>() {}

// Live implementation using PgDrizzle
export const UserRepositoryLive = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findAll: () =>
        db.select().from(users).pipe(Effect.withSpan('UserRepository.findAll')),

      findById: Effect.fn('UserRepository.findById')(function* (id: string) {
        const [user] = yield* db.select().from(users).where(eq(users.id, id))
        return Option.getOrNull(Option.fromNullable(user))
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
        return Option.getOrNull(Option.fromNullable(user))
      }),

      findByUsername: Effect.fn('UserRepository.findByUsername')(function* (
        username: string
      ) {
        const [user] = yield* db
          .select()
          .from(users)
          .where(eq(users.name, username))
        return Option.getOrNull(Option.fromNullable(user))
      }),

      create: Effect.fn('UserRepository.create')(function* (
        data: CreateUserData
      ) {
        const [user] = yield* db
          .insert(users)
          .values({
            ...data,
            emailVerified: pipe(
              Option.fromNullable(data.emailVerified),
              Option.getOrElse(() => false)
            ),
          })
          .returning()
        return Option.getOrNull(Option.fromNullable(user))
      }),

      update: Effect.fn('UserRepository.update')(function* (
        id: string,
        data: UpdateUserData
      ) {
        const [user] = yield* db
          .update(users)
          .set(data)
          .where(eq(users.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullable(user))
      }),

      delete: Effect.fn('UserRepository.delete')(function* (id: string) {
        const [user] = yield* db
          .delete(users)
          .where(eq(users.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullable(user))
      }),

      softDelete: Effect.fn('UserRepository.softDelete')(function* (
        id: string
      ) {
        const [user] = yield* db
          .update(users)
          .set({
            status: 'pending_deletion',
            deletedAt: nowAsDate(),
          })
          .where(eq(users.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullable(user))
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
          Option.flatMap((r) => Option.fromNullable(r.count)),
          Option.getOrElse(() => 0)
        )
      }),

      updateRole: Effect.fn('UserRepository.updateRole')(function* (
        id: string,
        role: UserRole
      ) {
        const [user] = yield* db
          .update(users)
          .set({ role, updatedAt: nowAsDate() })
          .where(eq(users.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullable(user))
      }),

      updateStatus: Effect.fn('UserRepository.updateStatus')(function* (
        id: string,
        status: UserStatus
      ) {
        const [user] = yield* db
          .update(users)
          .set({ status, updatedAt: nowAsDate() })
          .where(eq(users.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullable(user))
      }),

      findWeatherEnabled: () =>
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
          .pipe(Effect.withSpan('UserRepository.findWeatherEnabled')),

      findTipsEnabled: () =>
        db
          .select()
          .from(users)
          .where(eq(users.tips, true))
          .pipe(Effect.withSpan('UserRepository.findTipsEnabled')),
    }
  })
)
