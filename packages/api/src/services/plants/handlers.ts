import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { RedisEventBusLive } from '@lily/api/events'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { ScanRepositoryLive } from '@lily/api/repositories/scan.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { WeatherRepositoryLive } from '@lily/api/repositories/weather.repository'
import { AiService } from '@lily/api/services/ai/service'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { RedisClientLive } from '@lily/api/services/message-queue/redis.provider'
import { withPlantAuth } from '@lily/api/services/plants/helpers/with-plant-access'
import { PlantsService } from '@lily/api/services/plants/service'
import { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
import { UsageTrackerLive } from '@lily/api/services/subscriptions/usage-tracker'
import { WeatherCacheLive } from '@lily/api/services/weather/cache.live'
import { WeatherProviderLive } from '@lily/api/services/weather/provider.live'
import { FileService } from '@lily/shared/services/file/fileservice'
import { GCSService } from '@lily/shared/services/file/gcs'
import { Effect, Layer, Match, Option, pipe } from 'effect'

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
              ...pipe(
                Option.fromNullable(urlParams.roomId),
                Option.match({
                  onNone: () => ({}),
                  onSome: (roomId) => ({ roomId }),
                })
              ),
              includeCaretaking: urlParams.includeCaretaking === 'true',
            })
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('createPlant', ({ payload }) =>
          plantsService.createPlant(payload).pipe(withInfraErrorsAsDefect)
        )
        .handle('scanCard', ({ payload: { images, locale } }) =>
          plantsService.scanCard(images, locale).pipe(withInfraErrorsAsDefect)
        )
        .handle('scanCardMultiple', ({ payload: { images, locale } }) =>
          plantsService
            .scanCardMultiple(images, locale)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('aiIdentify', ({ payload: { images, locale } }) =>
          plantsService.aiIdentify(images, locale).pipe(withInfraErrorsAsDefect)
        )
        .handle('aiReIdentify', ({ payload: { imageUrls, locale } }) =>
          plantsService
            .aiReIdentify(imageUrls, locale)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('getPlant', ({ path: { id } }) =>
          plantsService
            .findPlantById({ id })
            .pipe(withPlantAuth(id), withInfraErrorsAsDefect)
        )
        .handle('updatePlant', ({ path: { id }, payload }) =>
          plantsService
            .updatePlant({ ...payload, id })
            .pipe(withPlantAuth(id), withInfraErrorsAsDefect)
        )
        .handle('deletePlant', ({ path: { id } }) =>
          plantsService
            .deletePlant({ id })
            .pipe(withPlantAuth(id), withInfraErrorsAsDefect)
        )
        .handle('getPlantPhotos', ({ path: { id }, urlParams }) =>
          plantsService
            .getPlantPhotos({
              plantId: id,
              page: parseInt(urlParams.page, 10) || 1,
              limit: parseInt(urlParams.limit, 10) || 20,
            })
            .pipe(withPlantAuth(id), withInfraErrorsAsDefect)
        )
        .handle('uploadPlantPhoto', ({ path: { id }, payload: { files } }) =>
          plantsService
            .uploadPlantPhoto({ plantId: id, files })
            .pipe(withPlantAuth(id), withInfraErrorsAsDefect)
        )
        .handle('deletePlantPhoto', ({ path: { id, photoId } }) =>
          plantsService
            .deletePlantPhoto({ plantId: id, photoId })
            .pipe(withPlantAuth(id), withInfraErrorsAsDefect)
        )
        .handle('carePlant', ({ path: { id }, payload }) =>
          plantsService
            .carePlant({ ...payload, id })
            .pipe(withPlantAuth(id), withInfraErrorsAsDefect)
        )
        .handle('careMultiplePlants', ({ payload }) =>
          plantsService
            .careMultiplePlants(payload)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('correctCareDates', ({ path: { id }, payload }) =>
          plantsService
            .correctCareDates({ ...payload, id })
            .pipe(withPlantAuth(id), withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(PlantsService.Default),
    Layer.provide(
      Layer.mergeAll(
        PlantRepositoryLive,
        CareScheduleRepositoryLive,
        DelegationRepositoryLive,
        CareLogRepositoryLive,
        NotificationRepositoryLive
      )
    ),
    Layer.provide(UserRepositoryLive),
    Layer.provide(ScanRepositoryLive),
    Layer.provide(AiService.Default),
    Layer.provide(GCSService.Default),
    Layer.provide(FileService.Default),
    Layer.provide(RedisEventBusLive),
    Layer.provide(AuthenticationLive),
    Layer.provide(LimitCheckerLive),
    Layer.provide(UsageTrackerLive),
    Layer.provide(SubscriptionRepositoryLive),
    Layer.provide(AchievementRepositoryLive),
    Layer.provide(WeatherProviderLive),
    Layer.provide(WeatherCacheLive),
    Layer.provide(WeatherRepositoryLive),
    Layer.provide(RedisClientLive)
  )
