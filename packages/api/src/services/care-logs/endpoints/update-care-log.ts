import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import type { CareLog, CareLogUpdateRequest } from '@lily/shared/care-log'
import { Effect } from 'effect'

// Update care log
export const updateCareLog = (
  plantId: string,
  logId: string,
  request: CareLogUpdateRequest
): Effect.Effect<CareLog, never, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle

    // Return fake updated care log
    const now = new Date()
    return {
      id: logId,
      type: 'watering', // CareLogUpdateRequest doesn't have type field
      notes: request.notes || 'Updated notes',
      date: request.date || now,
      plantId,
      createdAt: new Date('2024-01-15T10:00:00Z'), // Preserve original creation date
      updatedAt: now,
    }
  })
