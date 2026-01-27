import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { RedisEventBusLive } from '@lily/api/events'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { ScanRepositoryLive } from '@lily/api/repositories/scan.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AiService } from '@lily/api/services/ai/service'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { RedisClientLive } from '@lily/api/services/message-queue/redis.provider'
import { PlantsService } from '@lily/api/services/plants/service'
import { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
import { UsageTrackerLive } from '@lily/api/services/subscriptions/usage-tracker'
import { FileService } from '@lily/shared/services/file/fileservice'
import { GCSService } from '@lily/shared/services/file/gcs'
import { Effect, Layer } from 'effect'

// Implement the Plants API group
export const PlantsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'plants', (handlers) =>
    Effect.gen(function* () {
      const plantsService = yield* PlantsService

      return handlers
        .handle('getPlants', ({ urlParams }) =>
          plantsService.findPlants({
            page: parseInt(urlParams.page, 10) || 1,
            limit: parseInt(urlParams.limit, 10) || 20,
            filter:
              urlParams.filter === 'needsAttention' ? 'needsAttention' : 'all',
            sort: urlParams.sort === 'name' ? 'name' : 'added',
          })
        )
        .handle('createPlant', ({ payload }) =>
          plantsService.createPlant(payload)
        )
        .handle('scanCard', ({ payload: { images } }) =>
          plantsService.scanCard(images)
        )
        .handle('scanCardMultiple', ({ payload: { images } }) =>
          plantsService.scanCardMultiple(images)
        )
        .handle('aiIdentify', ({ payload: { images } }) => {
          console.log('[ai-identify handler] Received request', {
            imageCount: images.length,
          })
          return plantsService.aiIdentify(images)
        })
        .handle('getPlant', ({ path: { id } }) =>
          plantsService.findPlantById({ id })
        )
        .handle('updatePlant', ({ path: { id }, payload }) =>
          plantsService.updatePlant({ ...payload, id })
        )
        .handle('deletePlant', ({ path: { id } }) =>
          plantsService.deletePlant({ id })
        )
        .handle('getPlantPhotos', ({ path: { id }, urlParams }) =>
          plantsService.getPlantPhotos({
            plantId: id,
            page: parseInt(urlParams.page, 10) || 1,
            limit: parseInt(urlParams.limit, 10) || 20,
          })
        )
        .handle('uploadPlantPhoto', ({ path: { id }, payload: { files } }) =>
          plantsService.uploadPlantPhoto({ plantId: id, files })
        )
        .handle('deletePlantPhoto', ({ path: { id, photoId } }) =>
          plantsService.deletePlantPhoto({ plantId: id, photoId })
        )
        .handle('waterPlant', ({ path: { id }, payload }) =>
          plantsService.waterPlant({ ...payload, id })
        )
        .handle('waterMultiplePlants', ({ payload }) =>
          plantsService.waterMultiplePlants(payload)
        )
        .handle('fertilizePlant', ({ path: { id } }) =>
          plantsService.fertilizePlant({ id })
        )
    })
  ).pipe(
    Layer.provide(PlantsService.Default),
    Layer.provide(PlantRepositoryLive),
    Layer.provide(CareLogRepositoryLive),
    Layer.provide(NotificationRepositoryLive),
    Layer.provide(UserRepositoryLive),
    Layer.provide(ScanRepositoryLive),
    Layer.provide(AiService.Default),
    Layer.provide(GCSService.Default),
    Layer.provide(FileService.Default),
    Layer.provide(RedisEventBusLive),
    Layer.provide(RedisClientLive),
    Layer.provide(AuthenticationLive),
    Layer.provide(LimitCheckerLive),
    Layer.provide(UsageTrackerLive),
    Layer.provide(SubscriptionRepositoryLive),
    Layer.provide(AchievementRepositoryLive)
  )
