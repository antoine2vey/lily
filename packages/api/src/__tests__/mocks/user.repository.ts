import {
  UserRepository,
  type IUserRepository,
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
  }

  return Layer.succeed(UserRepository, repo)
}
