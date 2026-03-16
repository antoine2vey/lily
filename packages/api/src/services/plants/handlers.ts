import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { aiIdentify } from '@lily/api/services/plants/endpoints/ai-identify'
import { aiReIdentify } from '@lily/api/services/plants/endpoints/ai-re-identify'
import { careMultiplePlants } from '@lily/api/services/plants/endpoints/care-multiple-plants'
import { carePlant } from '@lily/api/services/plants/endpoints/care-plant'
import { correctCareDates } from '@lily/api/services/plants/endpoints/correct-care-dates'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import { deletePlant } from '@lily/api/services/plants/endpoints/delete-plant'
import { deletePlantPhoto } from '@lily/api/services/plants/endpoints/delete-plant-photo'
import { findPlantById } from '@lily/api/services/plants/endpoints/find-plant-by-id'
import { findPlants } from '@lily/api/services/plants/endpoints/find-plants'
import { getPlantPhotos } from '@lily/api/services/plants/endpoints/get-plant-photos'
import { scanCard } from '@lily/api/services/plants/endpoints/scan-card'
import { scanCardMultiple } from '@lily/api/services/plants/endpoints/scan-card-multiple'
import { sharePlant } from '@lily/api/services/plants/endpoints/share-plant'
import { updatePlant } from '@lily/api/services/plants/endpoints/update-plant'
import { uploadPlantPhoto } from '@lily/api/services/plants/endpoints/upload-plant-photo'
import { withPlantAuth } from '@lily/api/services/plants/helpers/with-plant-access'
import { Effect, Match, Option, pipe } from 'effect'

export const PlantsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'plants', (handlers) =>
    handlers
      .handle('getPlants', ({ urlParams }) =>
        findPlants({
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
        }).pipe(withInfraErrorsAsDefect)
      )
      .handle('createPlant', ({ payload }) =>
        createPlant(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('scanCard', ({ payload: { images, locale } }) =>
        scanCard(images, locale).pipe(withInfraErrorsAsDefect)
      )
      .handle('scanCardMultiple', ({ payload: { images, locale } }) =>
        scanCardMultiple(images, locale).pipe(withInfraErrorsAsDefect)
      )
      .handle('aiIdentify', ({ payload: { images, locale } }) =>
        aiIdentify(images, locale).pipe(withInfraErrorsAsDefect)
      )
      .handle('aiReIdentify', ({ payload: { imageUrls, locale } }) =>
        aiReIdentify(imageUrls, locale).pipe(withInfraErrorsAsDefect)
      )
      .handle('getPlant', ({ path: { id } }) =>
        withPlantAuth(id).pipe(
          Effect.flatMap((plant) => findPlantById(plant)),
          withInfraErrorsAsDefect
        )
      )
      .handle('updatePlant', ({ path: { id }, payload }) =>
        withPlantAuth(id).pipe(
          Effect.flatMap((plant) => updatePlant(plant, { ...payload, id })),
          withInfraErrorsAsDefect
        )
      )
      .handle('deletePlant', ({ path: { id } }) =>
        withPlantAuth(id).pipe(
          Effect.zipRight(deletePlant({ id })),
          withInfraErrorsAsDefect
        )
      )
      .handle('getPlantPhotos', ({ path: { id }, urlParams }) =>
        withPlantAuth(id).pipe(
          Effect.zipRight(
            getPlantPhotos({
              plantId: id,
              page: parseInt(urlParams.page, 10) || 1,
              limit: parseInt(urlParams.limit, 10) || 20,
            })
          ),
          withInfraErrorsAsDefect
        )
      )
      .handle('uploadPlantPhoto', ({ path: { id }, payload: { files } }) =>
        withPlantAuth(id).pipe(
          Effect.zipRight(uploadPlantPhoto({ plantId: id, files })),
          withInfraErrorsAsDefect
        )
      )
      .handle('deletePlantPhoto', ({ path: { id, photoId } }) =>
        withPlantAuth(id).pipe(
          Effect.zipRight(deletePlantPhoto({ plantId: id, photoId })),
          withInfraErrorsAsDefect
        )
      )
      .handle('carePlant', ({ path: { id }, payload }) =>
        withPlantAuth(id).pipe(
          Effect.flatMap((plant) => carePlant(plant, { ...payload, id })),
          withInfraErrorsAsDefect
        )
      )
      .handle('careMultiplePlants', ({ payload }) =>
        careMultiplePlants(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('correctCareDates', ({ path: { id }, payload }) =>
        withPlantAuth(id).pipe(
          Effect.flatMap((plant) =>
            correctCareDates(plant, { ...payload, id })
          ),
          withInfraErrorsAsDefect
        )
      )
      .handle('sharePlant', ({ path: { id } }) =>
        withPlantAuth(id).pipe(
          Effect.zipRight(sharePlant(id)),
          withInfraErrorsAsDefect
        )
      )
  )
