import { Database } from '@lily/db'
import type { UserProfile } from '@lily/shared/auth'
import { Effect } from 'effect'

// Get current user
export const getCurrentUser = () =>
  Effect.gen(function* () {
    const _db = yield* Database

    // Return fake user profile
    return {
      id: 'user_123',
      email: 'user@example.com',
      name: 'Test User',
      username: 'testuser',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date(),
    } satisfies UserProfile
  })
