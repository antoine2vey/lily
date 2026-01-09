import {
  type FindUsersFilters,
  type IUserRepository,
  UserRepository,
} from '@lily/api/repositories/user.repository'
import type { User } from '@lily/shared'
import { Effect, Layer } from 'effect'

export const createMockUserRepository = (
  users: User[]
): Layer.Layer<UserRepository> => {
  const repo: IUserRepository = {
    findAll: () => Effect.succeed(users),

    findById: (id: string) =>
      Effect.succeed(users.find((u) => u.id === id) ?? null),

    findByEmail: (email: string) =>
      Effect.succeed(users.find((u) => u.email === email) ?? null),

    findByUsername: (username: string) =>
      Effect.succeed(users.find((u) => u.name === username) ?? null),

    create: (data) => {
      const newUser: User = {
        id: `user-${crypto.randomUUID()}`,
        name: data.name,
        email: data.email,
        emailVerified: data.emailVerified ?? false,
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
      const user = users.find((u) => u.id === id)
      if (!user) return Effect.succeed(null)
      return Effect.succeed({ ...user, ...data, updatedAt: new Date() })
    },

    delete: (id) => {
      const user = users.find((u) => u.id === id)
      return Effect.succeed(user ?? null)
    },

    findAllPaginated: (filters: FindUsersFilters) =>
      Effect.succeed(
        (() => {
          let filtered = users

          if (filters.role) {
            filtered = filtered.filter((u) => u.role === filters.role)
          }
          if (filters.status) {
            filtered = filtered.filter((u) => u.status === filters.status)
          }
          if (filters.search) {
            const search = filters.search.toLowerCase()
            filtered = filtered.filter(
              (u) =>
                u.email.toLowerCase().includes(search) ||
                u.name.toLowerCase().includes(search)
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
            filtered = filtered.filter((u) => u.role === filters.role)
          }
          if (filters.status) {
            filtered = filtered.filter((u) => u.status === filters.status)
          }
          if (filters.search) {
            const search = filters.search.toLowerCase()
            filtered = filtered.filter(
              (u) =>
                u.email.toLowerCase().includes(search) ||
                u.name.toLowerCase().includes(search)
            )
          }

          return filtered.length
        })()
      ),

    updateRole: (id, role) => {
      const user = users.find((u) => u.id === id)
      if (!user) return Effect.succeed(null)
      return Effect.succeed({ ...user, role, updatedAt: new Date() })
    },

    updateStatus: (id, status) => {
      const user = users.find((u) => u.id === id)
      if (!user) return Effect.succeed(null)
      return Effect.succeed({ ...user, status, updatedAt: new Date() })
    },
  }

  return Layer.succeed(UserRepository, repo)
}
