import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import type { CareLog } from '@lily/shared/care-log'
import { Effect } from 'effect'

// Get care logs
export const getCareLogs = (
  plantId: string
): Effect.Effect<CareLog[], never, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle

    // Return fake care logs
    return [
      {
        id: 'log_1',
        type: 'watering',
        notes: 'Regular watering session',
        date: new Date('2024-01-15T10:00:00Z'),
        plantId,
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
      },
      {
        id: 'log_2',
        type: 'fertilization',
        notes: 'Added organic fertilizer',
        date: new Date('2024-01-20T14:30:00Z'),
        plantId,
        createdAt: new Date('2024-01-20T14:30:00Z'),
        updatedAt: new Date('2024-01-20T14:30:00Z'),
      },
    ]
  })
