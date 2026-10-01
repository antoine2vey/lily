import { CurrentUser } from '@lily/api/services/auth/middleware'
import { Session, type SessionContext } from '@lily/api/services/auth/session'
import type { UserProfile } from '@lily/shared/auth'
import { Layer, Option, pipe } from 'effect'

export const createMockSession = (
  options: Partial<SessionContext> = {}
): Layer.Layer<Session> => {
  const userId = pipe(
    Option.fromNullishOr(options.userId),
    Option.getOrElse(() => 'test-user-id')
  )
  const mockSession: SessionContext = {
    userId,
    user: pipe(
      Option.fromNullishOr(options.user),
      Option.getOrElse(() => ({
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        firstName: null,
        lastName: null,
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
    Option.fromNullishOr(options.id),
    Option.getOrElse(() => 'test-user-id')
  )
  const mockUser: UserProfile = {
    id: userId,
    email: pipe(
      Option.fromNullishOr(options.email),
      Option.getOrElse(() => 'test@example.com')
    ),
    name: pipe(
      Option.fromNullishOr(options.name),
      Option.getOrElse(() => 'Test User')
    ),
    firstName: pipe(
      Option.fromNullishOr(options.firstName),
      Option.getOrElse<string | null>(() => null)
    ),
    lastName: pipe(
      Option.fromNullishOr(options.lastName),
      Option.getOrElse<string | null>(() => null)
    ),
    username: options.username,
    createdAt: pipe(
      Option.fromNullishOr(options.createdAt),
      Option.getOrElse(() => new Date())
    ),
    updatedAt: pipe(
      Option.fromNullishOr(options.updatedAt),
      Option.getOrElse(() => new Date())
    ),
    role: pipe(
      Option.fromNullishOr(options.role),
      Option.getOrElse(() => 'user' as const)
    ),
    status: pipe(
      Option.fromNullishOr(options.status),
      Option.getOrElse(() => 'active' as const)
    ),
  }

  return Layer.succeed(CurrentUser, mockUser)
}
