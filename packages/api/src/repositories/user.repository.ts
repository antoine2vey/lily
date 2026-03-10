import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { users } from '@lily/db/schema'
import { nowAsDate } from '@lily/shared'
import { and, desc, eq, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

// Types for repository methods
export interface CreateUserData {
  name: string
  email: string
  emailVerified?: boolean
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
  role?: 'user' | 'admin'
  status?: 'active' | 'suspended' | 'banned'
  language?: 'en' | 'fr'
  timezone?: string | null
  preferredNotificationTime?: string | null
  weatherEnabled?: boolean
  latitude?: number | null
  longitude?: number | null
}

export interface FindUsersFilters {
  page: number
  limit: number
  role?: 'user' | 'admin'
  status?: 'active' | 'suspended' | 'banned'
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
    role: 'user' | 'admin'
  ) => Effect.Effect<typeof users.$inferSelect | null, SqlError>
  readonly updateStatus: (
    id: string,
    status: 'active' | 'suspended' | 'banned'
  ) => Effect.Effect<typeof users.$inferSelect | null, SqlError>
  readonly findWeatherEnabled: () => Effect.Effect<
    Array<typeof users.$inferSelect>,
    SqlError
  >
  readonly findTipsEnabled: () => Effect.Effect<
    Array<typeof users.$inferSelect>,
    SqlError
  >
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

      findById: (id: string) =>
        Effect.gen(function* () {
          const [user] = yield* db.select().from(users).where(eq(users.id, id))
          return Option.getOrNull(Option.fromNullable(user))
        }).pipe(Effect.withSpan('UserRepository.findById')),

      findByIds: (ids: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          if (ids.length === 0) return [] as Array<typeof users.$inferSelect>
          return yield* db
            .select()
            .from(users)
            .where(inArray(users.id, [...ids]))
        }).pipe(Effect.withSpan('UserRepository.findByIds')),

      findByEmail: (email: string) =>
        Effect.gen(function* () {
          const [user] = yield* db
            .select()
            .from(users)
            .where(eq(users.email, email))
          return Option.getOrNull(Option.fromNullable(user))
        }).pipe(Effect.withSpan('UserRepository.findByEmail')),

      findByUsername: (username: string) =>
        Effect.gen(function* () {
          const [user] = yield* db
            .select()
            .from(users)
            .where(eq(users.name, username))
          return Option.getOrNull(Option.fromNullable(user))
        }).pipe(Effect.withSpan('UserRepository.findByUsername')),

      create: (data: CreateUserData) =>
        Effect.gen(function* () {
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
        }).pipe(Effect.withSpan('UserRepository.create')),

      update: (id: string, data: UpdateUserData) =>
        Effect.gen(function* () {
          const [user] = yield* db
            .update(users)
            .set(data)
            .where(eq(users.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(user))
        }).pipe(Effect.withSpan('UserRepository.update')),

      delete: (id: string) =>
        Effect.gen(function* () {
          const [user] = yield* db
            .delete(users)
            .where(eq(users.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(user))
        }).pipe(Effect.withSpan('UserRepository.delete')),

      findAllPaginated: (filters: FindUsersFilters) =>
        Effect.gen(function* () {
          const { page, limit, role, status, search } = filters
          const offset = (page - 1) * limit

          // Build where conditions
          const conditions = []
          if (role) conditions.push(eq(users.role, role))
          if (status) conditions.push(eq(users.status, status))
          if (search) {
            conditions.push(
              or(
                ilike(users.email, `%${search}%`),
                ilike(users.name, `%${search}%`)
              )
            )
          }

          const whereClause =
            conditions.length > 0 ? and(...conditions) : undefined

          const results = yield* db
            .select()
            .from(users)
            .where(whereClause)
            .orderBy(desc(users.createdAt))
            .limit(limit)
            .offset(offset)

          return results
        }).pipe(Effect.withSpan('UserRepository.findAllPaginated')),

      countUsers: (filters: Omit<FindUsersFilters, 'page' | 'limit'>) =>
        Effect.gen(function* () {
          const { role, status, search } = filters

          // Build where conditions
          const conditions = []
          if (role) conditions.push(eq(users.role, role))
          if (status) conditions.push(eq(users.status, status))
          if (search) {
            conditions.push(
              or(
                ilike(users.email, `%${search}%`),
                ilike(users.name, `%${search}%`)
              )
            )
          }

          const whereClause =
            conditions.length > 0 ? and(...conditions) : undefined

          const result = yield* db
            .select({ count: sql<number>`count(*)::int` })
            .from(users)
            .where(whereClause)

          return pipe(
            Array.head(result),
            Option.flatMap((r) => Option.fromNullable(r.count)),
            Option.getOrElse(() => 0)
          )
        }).pipe(Effect.withSpan('UserRepository.countUsers')),

      updateRole: (id: string, role: 'user' | 'admin') =>
        Effect.gen(function* () {
          const [user] = yield* db
            .update(users)
            .set({ role, updatedAt: nowAsDate() })
            .where(eq(users.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(user))
        }).pipe(Effect.withSpan('UserRepository.updateRole')),

      updateStatus: (id: string, status: 'active' | 'suspended' | 'banned') =>
        Effect.gen(function* () {
          const [user] = yield* db
            .update(users)
            .set({ status, updatedAt: nowAsDate() })
            .where(eq(users.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(user))
        }).pipe(Effect.withSpan('UserRepository.updateStatus')),

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
