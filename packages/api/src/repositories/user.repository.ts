import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { users } from '@lily/db'
import { nowAsDate } from '@lily/shared'
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
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
  timezone?: string | null
  preferredNotificationTime?: string | null
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
      findAll: () => db.select().from(users),

      findById: (id: string) =>
        Effect.gen(function* () {
          const [user] = yield* db.select().from(users).where(eq(users.id, id))
          return Option.getOrNull(Option.fromNullable(user))
        }),

      findByEmail: (email: string) =>
        Effect.gen(function* () {
          const [user] = yield* db
            .select()
            .from(users)
            .where(eq(users.email, email))
          return Option.getOrNull(Option.fromNullable(user))
        }),

      findByUsername: (username: string) =>
        Effect.gen(function* () {
          const [user] = yield* db
            .select()
            .from(users)
            .where(eq(users.name, username))
          return Option.getOrNull(Option.fromNullable(user))
        }),

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
        }),

      update: (id: string, data: UpdateUserData) =>
        Effect.gen(function* () {
          const [user] = yield* db
            .update(users)
            .set(data)
            .where(eq(users.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(user))
        }),

      delete: (id: string) =>
        Effect.gen(function* () {
          const [user] = yield* db
            .delete(users)
            .where(eq(users.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(user))
        }),

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
        }),

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
        }),

      updateRole: (id: string, role: 'user' | 'admin') =>
        Effect.gen(function* () {
          const [user] = yield* db
            .update(users)
            .set({ role, updatedAt: nowAsDate() })
            .where(eq(users.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(user))
        }),

      updateStatus: (id: string, status: 'active' | 'suspended' | 'banned') =>
        Effect.gen(function* () {
          const [user] = yield* db
            .update(users)
            .set({ status, updatedAt: nowAsDate() })
            .where(eq(users.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(user))
        }),
    }
  })
)
