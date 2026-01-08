import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { Auth } from '@lily/api/services/auth/auth'
import { withSession } from '@lily/api/services/auth/session'
import { PlantsService } from '@lily/api/services/plants/service'
import { AiService } from '@lily/shared/services/ai/service'
import { FileService } from '@lily/shared/services/file/fileservice'
import { GCSService } from '@lily/shared/services/file/gcs'
import { Effect, Layer } from 'effect'

// Implement the Plants API group
export const PlantsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'plants', (handlers) =>
    Effect.gen(function* () {
      const plantsService = yield* PlantsService

      return handlers
        .handle('getPlants', () =>
          plantsService.findPlants({
            page: 1,
            limit: 10,
            filter: 'all',
            sort: 'added',
          })
        )
        .handle('createPlant', ({ payload }) =>
          withSession(plantsService.createPlant(payload))
        )
        .handle('scanCard', ({ payload: { images } }) =>
          plantsService.scanCard(images)
        )
        .handle('aiIdentify', ({ payload: { images } }) =>
          plantsService.aiIdentify(images)
        )
        .handle('getPlant', ({ path: { id } }) =>
          plantsService.findPlantById({ id })
        )
        .handle('updatePlant', ({ path: { id }, payload }) =>
          plantsService.updatePlant({ ...payload, id })
        )
        .handle('deletePlant', ({ path: { id } }) =>
          plantsService.deletePlant({ id })
        )
        .handle('getPlantPhotos', ({ path: { id } }) =>
          plantsService.getPlantPhotos({ plantId: id })
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
        .handle('fertilizePlant', ({ path: { id } }) =>
          plantsService.fertilizePlant({ id })
        )
    })
  ).pipe(
    Layer.provide(PlantsService.Default),
    Layer.provide(PlantRepositoryLive),
    Layer.provide(CareLogRepositoryLive),
    Layer.provide(Auth.Default),
    Layer.provide(AiService.Default),
    Layer.provide(GCSService.Default),
    Layer.provide(FileService.Default)
  )
