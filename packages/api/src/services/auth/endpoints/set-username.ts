import { type PrismaError, PrismaService } from '@lily/db'
import type { UsernameRequest, UserProfile } from '@lily/shared/auth'
import { Effect } from 'effect'

// Set username
export const setUsername = (
  request: UsernameRequest
): Effect.Effect<UserProfile, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    // Return fake updated user profile
    return {
      id: 'user_123',
      email: 'user@example.com',
      name: 'Test User',
      username: request.username,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date(),
    }
  })
