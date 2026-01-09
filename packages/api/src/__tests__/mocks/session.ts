import { CurrentUser } from '@lily/api/services/auth/middleware'
import { Session, type SessionContext } from '@lily/api/services/auth/session'
import type { UserProfile } from '@lily/shared/auth'
import { Layer } from 'effect'

export const createMockSession = (
  options: Partial<SessionContext> = {}
): Layer.Layer<Session> => {
  const userId = options.userId ?? 'test-user-id'
  const mockSession: SessionContext = {
    userId,
    user: options.user ?? {
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }

  return Layer.succeed(Session, mockSession)
}

export const createMockCurrentUser = (
  options: Partial<UserProfile> = {}
): Layer.Layer<CurrentUser> => {
  const userId = options.id ?? 'test-user-id'
  const mockUser: UserProfile = {
    id: userId,
    email: options.email ?? 'test@example.com',
    name: options.name ?? 'Test User',
    username: options.username,
    createdAt: options.createdAt ?? new Date(),
    updatedAt: options.updatedAt ?? new Date(),
  }

  return Layer.succeed(CurrentUser, mockUser)
}
