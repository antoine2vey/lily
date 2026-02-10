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
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { RedisClientLive } from '@lily/api/services/message-queue/redis.provider'
import { PlantsService } from '@lily/api/services/plants/service'
import { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
import { UsageTrackerLive } from '@lily/api/services/subscriptions/usage-tracker'
import { FileService } from '@lily/shared/services/file/fileservice'
import { GCSService } from '@lily/shared/services/file/gcs'
import { Effect, Layer, Match, pipe } from 'effect'

// Implement the Plants API group
export const PlantsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'plants', (handlers) =>
    Effect.gen(function* () {
      const plantsService = yield* PlantsService

      return handlers
        .handle('getPlants', ({ urlParams }) =>
          plantsService
            .findPlants({
              page: parseInt(urlParams.page, 10) || 1,
              limit: parseInt(urlParams.limit, 10) || 20,
              filter: pipe(
                Match.value(urlParams.filter),
                Match.when('needsAttention', () => 'needsAttention' as const),
                Match.when('overdue', () => 'overdue' as const),
                Match.orElse(() => 'all' as const)
              ),
              sort: urlParams.sort === 'name' ? 'name' : 'added',
              ...(urlParams.roomId !== undefined
                ? { roomId: urlParams.roomId }
                : {}),
            })
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('createPlant', ({ payload }) =>
          plantsService.createPlant(payload).pipe(withInfraErrorsAsDefect)
        )
        .handle('scanCard', ({ payload: { images } }) =>
          plantsService.scanCard(images).pipe(withInfraErrorsAsDefect)
        )
        .handle('scanCardMultiple', ({ payload: { images } }) =>
          plantsService.scanCardMultiple(images).pipe(withInfraErrorsAsDefect)
        )
        .handle('aiIdentify', ({ payload: { images } }) =>
          plantsService.aiIdentify(images).pipe(withInfraErrorsAsDefect)
        )
        .handle('getPlant', ({ path: { id } }) =>
          plantsService.findPlantById({ id }).pipe(withInfraErrorsAsDefect)
        )
        .handle('updatePlant', ({ path: { id }, payload }) =>
          plantsService
            .updatePlant({ ...payload, id })
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('deletePlant', ({ path: { id } }) =>
          plantsService.deletePlant({ id }).pipe(withInfraErrorsAsDefect)
        )
        .handle('getPlantPhotos', ({ path: { id }, urlParams }) =>
          plantsService
            .getPlantPhotos({
              plantId: id,
              page: parseInt(urlParams.page, 10) || 1,
              limit: parseInt(urlParams.limit, 10) || 20,
            })
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('uploadPlantPhoto', ({ path: { id }, payload: { files } }) =>
          plantsService
            .uploadPlantPhoto({ plantId: id, files })
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('deletePlantPhoto', ({ path: { id, photoId } }) =>
          plantsService
            .deletePlantPhoto({ plantId: id, photoId })
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('waterPlant', ({ path: { id }, payload }) =>
          plantsService
            .waterPlant({ ...payload, id })
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('waterMultiplePlants', ({ payload }) =>
          plantsService
            .waterMultiplePlants(payload)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('fertilizePlant', ({ path: { id } }) =>
          plantsService.fertilizePlant({ id }).pipe(withInfraErrorsAsDefect)
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
