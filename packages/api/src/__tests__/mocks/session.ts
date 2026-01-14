import { CurrentUser } from '@lily/api/services/auth/middleware'
import { Session, type SessionContext } from '@lily/api/services/auth/session'
import type { UserProfile } from '@lily/shared/auth'
import { Layer, Option, pipe } from 'effect'

export const createMockSession = (
  options: Partial<SessionContext> = {}
): Layer.Layer<Session> => {
  const userId = pipe(
    Option.fromNullable(options.userId),
    Option.getOrElse(() => 'test-user-id')
  )
  const mockSession: SessionContext = {
    userId,
    user: pipe(
      Option.fromNullable(options.user),
      Option.getOrElse(() => ({
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'user' as const,
        status: 'active' as const,
      }))
    ),
  }

  return Layer.succeed(Session, mockSession)
}

export const createMockCurrentUser = (
  options: Partial<UserProfile> = {}
): Layer.Layer<CurrentUser> => {
  const userId = pipe(
    Option.fromNullable(options.id),
    Option.getOrElse(() => 'test-user-id')
  )
  const mockUser: UserProfile = {
    id: userId,
    email: pipe(
      Option.fromNullable(options.email),
      Option.getOrElse(() => 'test@example.com')
    ),
    name: pipe(
      Option.fromNullable(options.name),
      Option.getOrElse(() => 'Test User')
    ),
    username: options.username,
    createdAt: pipe(
      Option.fromNullable(options.createdAt),
      Option.getOrElse(() => new Date())
    ),
    updatedAt: pipe(
      Option.fromNullable(options.updatedAt),
      Option.getOrElse(() => new Date())
    ),
    role: pipe(
      Option.fromNullable(options.role),
      Option.getOrElse(() => 'user' as const)
    ),
    status: pipe(
      Option.fromNullable(options.status),
      Option.getOrElse(() => 'active' as const)
    ),
  }

  return Layer.succeed(CurrentUser, mockUser)
}
