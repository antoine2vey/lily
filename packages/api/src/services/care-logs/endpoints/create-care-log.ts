import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import type { CareLog, CareLogCreateRequest } from '@lily/shared/care-log'
import { Effect } from 'effect'

// Create care log
export const createCareLog = (
  plantId: string,
  request: CareLogCreateRequest
): Effect.Effect<CareLog, never, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle

    // Return fake new care log
    const now = new Date()
    return {
      id: 'new_log',
      type: request.type,
      notes: request.notes,
      date: request.date || now,
      plantId,
      createdAt: now,
      updatedAt: now,
    }
  })
