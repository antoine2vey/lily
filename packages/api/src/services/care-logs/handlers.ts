import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { RedisEventBusLive } from '@lily/api/events'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { CareLogsService } from '@lily/api/services/care-logs/service'
import { RedisClientLive } from '@lily/api/services/message-queue/redis.provider'
import { Effect, Layer } from 'effect'

// Implement the Care Logs API group
export const CareLogsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'careLogs', (handlers) =>
    Effect.gen(function* () {
      const careLogsService = yield* CareLogsService

      return handlers
        .handle('getRecentActivities', ({ urlParams }) =>
          careLogsService.getRecentActivities({
            limit: parseInt(urlParams.limit, 10) || 10,
          })
        )
        .handle('getCareLogs', ({ path: { plantId }, urlParams }) =>
          careLogsService.getCareLogs({
            plantId,
            page: parseInt(urlParams.page, 10) || 1,
            limit: parseInt(urlParams.limit, 10) || 20,
            type:
              urlParams.type === 'watering' ||
              urlParams.type === 'fertilization'
                ? urlParams.type
                : 'all',
          })
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
    Layer.provide(CareLogRepositoryLive),
    Layer.provide(PlantRepositoryLive),
    Layer.provide(NotificationRepositoryLive),
    Layer.provide(RedisEventBusLive),
    Layer.provide(RedisClientLive),
    Layer.provide(AuthenticationLive)
  )
