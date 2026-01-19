import {
  type FindUsersFilters,
  type IUserRepository,
  UserRepository,
} from '@lily/api/repositories/user.repository'
import type { User } from '@lily/shared'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export const createMockUserRepository = (
  users: User[]
): Layer.Layer<UserRepository> => {
  const repo: IUserRepository = {
    findAll: () => Effect.succeed(users),

    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(users, (u) => u.id === id),
          Option.getOrNull
        )
      ),

    findByEmail: (email: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(users, (u) => u.email === email),
          Option.getOrNull
        )
      ),

    findByUsername: (username: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(users, (u) => u.name === username),
          Option.getOrNull
        )
      ),

    create: (data) => {
      const newUser: User = {
        id: `user-${crypto.randomUUID()}`,
        name: data.name,
        email: data.email,
        emailVerified: pipe(
          Option.fromNullable(data.emailVerified),
          Option.getOrElse(() => false)
        ),
        image: null,
        bio: null,
        soilAlerts: true,
        wateringReminders: true,
        ads: false,
        historyViewCount: 0,
        role: 'user',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      return Effect.succeed(newUser)
    },

    update: (id, data) => {
      const userOption = Array.findFirst(users, (u) => u.id === id)
      return Option.match(userOption, {
        onNone: () => Effect.succeed(null),
        onSome: (user) =>
          Effect.succeed({ ...user, ...data, updatedAt: new Date() }),
      })
    },

    delete: (id) =>
      Effect.succeed(
        pipe(
          Array.findFirst(users, (u) => u.id === id),
          Option.getOrNull
        )
      ),

    findAllPaginated: (filters: FindUsersFilters) =>
      Effect.succeed(
        (() => {
          let filtered = users

          if (filters.role) {
            filtered = Array.filter(filtered, (u) => u.role === filters.role)
          }
          if (filters.status) {
            filtered = Array.filter(
              filtered,
              (u) => u.status === filters.status
            )
          }
          if (filters.search) {
            const search = filters.search.toLowerCase()
            filtered = Array.filter(
              filtered,
              (u) =>
                u.email.toLowerCase().includes(search) ||
                u.name?.toLowerCase().includes(search)
            )
          }

          const offset = (filters.page - 1) * filters.limit
          return filtered.slice(offset, offset + filters.limit)
        })()
      ),

    countUsers: (filters) =>
      Effect.succeed(
        (() => {
          let filtered = users

          if (filters.role) {
            filtered = Array.filter(filtered, (u) => u.role === filters.role)
          }
          if (filters.status) {
            filtered = Array.filter(
              filtered,
              (u) => u.status === filters.status
            )
          }
          if (filters.search) {
            const search = filters.search.toLowerCase()
            filtered = Array.filter(
              filtered,
              (u) =>
                u.email.toLowerCase().includes(search) ||
                u.name?.toLowerCase().includes(search)
            )
          }

          return filtered.length
        })()
      ),

    updateRole: (id, role) => {
      const userOption = Array.findFirst(users, (u) => u.id === id)
      return Option.match(userOption, {
        onNone: () => Effect.succeed(null),
        onSome: (user) =>
          Effect.succeed({ ...user, role, updatedAt: new Date() }),
      })
    },

    updateStatus: (id, status) => {
      const userOption = Array.findFirst(users, (u) => u.id === id)
      return Option.match(userOption, {
        onNone: () => Effect.succeed(null),
        onSome: (user) =>
          Effect.succeed({ ...user, status, updatedAt: new Date() }),
      })
    },
  }

  return Layer.succeed(UserRepository, repo)
}
