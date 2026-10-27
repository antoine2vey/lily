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
import { detect } from '@lily/api/services/plants/endpoints/detect'
import { findPlantById } from '@lily/api/services/plants/endpoints/find-plant-by-id'
import { findPlants } from '@lily/api/services/plants/endpoints/find-plants'
import { getPlantPhotos } from '@lily/api/services/plants/endpoints/get-plant-photos'
import { markPlantDead } from '@lily/api/services/plants/endpoints/mark-plant-dead'
import { revivePlant } from '@lily/api/services/plants/endpoints/revive-plant'
import { scanCard } from '@lily/api/services/plants/endpoints/scan-card'
import { scanCardMultiple } from '@lily/api/services/plants/endpoints/scan-card-multiple'
import { sharePlant } from '@lily/api/services/plants/endpoints/share-plant'
import { updatePlant } from '@lily/api/services/plants/endpoints/update-plant'
import { uploadPlantPhoto } from '@lily/api/services/plants/endpoints/upload-plant-photo'
import { withPlantAuth } from '@lily/api/services/plants/helpers/with-plant-access'
import { parsePaginationParams } from '@lily/shared'
import { Effect, Match, Option, pipe } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

export const PlantsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'plants', (handlers) =>
    handlers
      .handle('getPlants', ({ query: urlParams }) =>
        findPlants({
          ...parsePaginationParams(urlParams),
          filter: pipe(
            Match.value(urlParams.filter),
            Match.when('needsAttention', () => 'needsAttention' as const),
            Match.when('overdue', () => 'overdue' as const),
            Match.when('dead', () => 'dead' as const),
            Match.orElse(() => 'all' as const)
          ),
          sort: urlParams.sort === 'name' ? 'name' : 'added',
          ...pipe(
            Option.fromNullishOr(urlParams.roomId),
            Option.match({
              onNone: () => ({}),
              onSome: (roomId) => ({ roomId }),
            })
          ),
          includeCaretaking: urlParams.includeCaretaking === 'true',
          includeCanopy: urlParams.includeCanopy === 'true',
        }).pipe(withInfraErrorsAsDefect)
      )
      .handle('createPlant', ({ payload }) =>
        createPlant(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('detect', ({ payload: { images, locale } }) =>
        detect(images, locale).pipe(withInfraErrorsAsDefect)
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
      .handle('getPlant', ({ params: { id } }) =>
        withPlantAuth(id, 'view').pipe(
          Effect.flatMap((plant) => findPlantById(plant)),
          withInfraErrorsAsDefect
        )
      )
      .handle('updatePlant', ({ params: { id }, payload: { data, image } }) =>
        withPlantAuth(id, 'edit').pipe(
          Effect.flatMap((plant) => updatePlant(plant, { ...data, id }, image)),
          withInfraErrorsAsDefect
        )
      )
      .handle('deletePlant', ({ params: { id } }) =>
        withPlantAuth(id, 'delete').pipe(
          Effect.flatMap((plant) => deletePlant(plant, id)),
          withInfraErrorsAsDefect
        )
      )
      .handle('markPlantDead', ({ params: { id }, payload }) =>
        withPlantAuth(id, 'markDead').pipe(
          Effect.flatMap((plant) => markPlantDead(plant, payload, id)),
          withInfraErrorsAsDefect
        )
      )
      .handle('revivePlant', ({ params: { id } }) =>
        withPlantAuth(id, 'revive').pipe(
          Effect.flatMap((plant) => revivePlant(plant, id)),
          withInfraErrorsAsDefect
        )
      )
      .handle('getPlantPhotos', ({ params: { id }, query: urlParams }) =>
        withPlantAuth(id, 'photo').pipe(
          Effect.andThen(
            getPlantPhotos({
              plantId: id,
              ...parsePaginationParams(urlParams),
            })
          ),
          withInfraErrorsAsDefect
        )
      )
      .handle('uploadPlantPhoto', ({ params: { id }, payload: { files } }) =>
        withPlantAuth(id, 'photo').pipe(
          Effect.andThen(uploadPlantPhoto({ plantId: id, files })),
          withInfraErrorsAsDefect
        )
      )
      .handle('deletePlantPhoto', ({ params: { id, photoId } }) =>
        withPlantAuth(id, 'photo').pipe(
          Effect.andThen(deletePlantPhoto({ plantId: id, photoId })),
          withInfraErrorsAsDefect
        )
      )
      .handle('carePlant', ({ params: { id }, payload }) =>
        withPlantAuth(id, 'care').pipe(
          Effect.flatMap((plant) => carePlant(plant, { ...payload, id })),
          withInfraErrorsAsDefect
        )
      )
      .handle('careMultiplePlants', ({ payload }) =>
        careMultiplePlants(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('correctCareDates', ({ params: { id }, payload }) =>
        withPlantAuth(id, 'care').pipe(
          Effect.flatMap((plant) =>
            correctCareDates(plant, { ...payload, id })
          ),
          withInfraErrorsAsDefect
        )
      )
      .handle('sharePlant', ({ params: { id } }) =>
        withPlantAuth(id, 'view').pipe(
          Effect.andThen(sharePlant(id)),
          withInfraErrorsAsDefect
        )
      )
  )
