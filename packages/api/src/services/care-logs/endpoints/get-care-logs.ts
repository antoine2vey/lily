import type { SqlError } from '@effect/sql/SqlError'
import {
  CareLogRepository,
  type FindCareLogsParams,
} from '@lily/api/repositories/care-log.repository'
import type { CareLogsListResponse } from '@lily/shared/care-log'
import { Effect } from 'effect'

// Get care logs
export const getCareLogs = (
  params: FindCareLogsParams
): Effect.Effect<CareLogsListResponse, SqlError, CareLogRepository> =>
  Effect.gen(function* () {
    const repo = yield* CareLogRepository
    return yield* repo.findByPlantId(params)
  })
