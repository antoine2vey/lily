import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import type { CareLog } from '@lily/shared/care-log'
import { Effect } from 'effect'

// Get care log
export const getCareLog = (
  plantId: string,
  logId: string
): Effect.Effect<CareLog, never, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle

    // Return fake care log
    return {
      id: logId,
      type: 'watering',
      notes: 'Detailed care log entry',
      date: new Date('2024-01-15T10:00:00Z'),
      plantId,
      createdAt: new Date('2024-01-15T10:00:00Z'),
      updatedAt: new Date(),
    }
  })
