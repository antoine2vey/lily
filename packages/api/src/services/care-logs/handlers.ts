import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareLogsService } from '@lily/api/services/care-logs/service'
import { Effect, Layer } from 'effect'

// Implement the Care Logs API group
export const CareLogsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'careLogs', (handlers) =>
    Effect.gen(function* () {
      const careLogsService = yield* CareLogsService

      return handlers
        .handle('getCareLogs', ({ path: { plantId } }) =>
          careLogsService.getCareLogs(plantId)
        )
        .handle('createCareLog', ({ path: { plantId }, payload }) =>
          careLogsService.createCareLog(plantId, payload)
        )
        .handle('getCareLog', ({ path: { plantId, logId } }) =>
          careLogsService.getCareLog(plantId, logId)
        )
        .handle('updateCareLog', ({ path: { plantId, logId }, payload }) =>
          careLogsService.updateCareLog(plantId, logId, payload)
        )
        .handle('deleteCareLog', ({ path: { plantId, logId } }) =>
          careLogsService.deleteCareLog(plantId, logId)
        )
    })
  ).pipe(
    Layer.provide(CareLogsService.Default),
    Layer.provide(CareLogRepositoryLive)
  )
