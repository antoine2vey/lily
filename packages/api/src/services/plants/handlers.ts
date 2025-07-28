import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { PlantsService } from '@lily/api/services/plants/service'
import { PrismaService } from '@lily/db'
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
          plantsService.createPlant(payload)
        )
        .handle('scanCard', () => plantsService.scanCard())
        .handle('aiIdentify', () => plantsService.aiIdentify())
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
        .handle('uploadPlantPhoto', ({ path: { id } }) =>
          plantsService.uploadPlantPhoto({ plantId: id })
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
    Layer.provide(PrismaService.Default)
  )
