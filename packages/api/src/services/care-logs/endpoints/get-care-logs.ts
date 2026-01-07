import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { CareLog } from '@lily/shared/care-log'
import { Effect } from 'effect'

// Get care logs
export const getCareLogs = (
  plantId: string,
  type?: 'watering' | 'fertilization'
): Effect.Effect<CareLog[], SqlError, CareLogRepository> =>
  Effect.gen(function* () {
    const repo = yield* CareLogRepository
    return yield* repo.findByPlantId(plantId, type)
  })
