import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import type { Achievement } from '@lily/shared/achievement'
import { Effect } from 'effect'

// Get user achievements
export const getUserAchievements = (
  userId: string
): Effect.Effect<Achievement[], never, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle

    // Return fake achievements data
    return [
      {
        id: 'ach_1',
        key: 'first_plant',
        name: 'First Plant',
        description: 'Added your first plant to the garden',
        iconUrl: '/icons/first-plant.png',
        unlockedAt: new Date('2024-01-15T10:00:00Z'),
        userId,
      },
      {
        id: 'ach_2',
        key: 'green_thumb',
        name: 'Green Thumb',
        description: 'Successfully watered 10 plants',
        iconUrl: '/icons/green-thumb.png',
        unlockedAt: new Date('2024-02-01T14:30:00Z'),
        userId,
      },
    ]
  })
