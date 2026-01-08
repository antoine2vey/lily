import { Session, type SessionContext } from '@lily/api/services/auth/session'
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
