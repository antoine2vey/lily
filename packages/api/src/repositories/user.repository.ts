import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { users } from '@lily/db'
import { eq } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

// Types for repository methods
export interface CreateUserData {
  name: string
  email: string
  emailVerified?: boolean
}

export interface UpdateUserData {
  name?: string
  email?: string
  image?: string
  bio?: string
  soilAlerts?: boolean
  wateringReminders?: boolean
  ads?: boolean
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
          return user ?? null
        }),

      findByEmail: (email: string) =>
        Effect.gen(function* () {
          const [user] = yield* db
            .select()
            .from(users)
            .where(eq(users.email, email))
          return user ?? null
        }),

      findByUsername: (username: string) =>
        Effect.gen(function* () {
          const [user] = yield* db
            .select()
            .from(users)
            .where(eq(users.name, username))
          return user ?? null
        }),

      create: (data: CreateUserData) =>
        Effect.gen(function* () {
          const [user] = yield* db
            .insert(users)
            .values({ ...data, emailVerified: data.emailVerified ?? false })
            .returning()
          return user ?? null
        }),

      update: (id: string, data: UpdateUserData) =>
        Effect.gen(function* () {
          const [user] = yield* db
            .update(users)
            .set(data)
            .where(eq(users.id, id))
            .returning()
          return user ?? null
        }),

      delete: (id: string) =>
        Effect.gen(function* () {
          const [user] = yield* db
            .delete(users)
            .where(eq(users.id, id))
            .returning()
          return user ?? null
        }),
    }
  })
)
