import { ownerOf } from '@lily/api/repositories/helpers/plant-owner'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import {
  ClientImage,
  readClientImage,
} from '@lily/api/services/helpers/client-image'
import type { EnhancedPlantCreateRequest, Plant } from '@lily/shared/plant'
import { GCSService } from '@lily/shared/services/file/gcs'
import { plantFolder } from '@lily/shared/services/file/stored-object'
import { Effect, Struct } from 'effect'

/**
 * Creates a plant from a request whose image may be a scan photo. A scan
 * answers with a signed URL of the private bucket, which expires, so the
 * plant gets a public copy of the caller's own scan photo instead. Any other
 * reference is not the caller's to show and the plant gets no image.
 */
export const withScanPhoto = <E, R>(
  request: EnhancedPlantCreateRequest,
  create: (request: EnhancedPlantCreateRequest) => Effect.Effect<Plant, E, R>
) =>
  Effect.gen(function* () {
    const gcs = yield* GCSService
    const repo = yield* PlantRepository
    if (request.imageUrl === undefined) return yield* create(request)

    const withoutImage = Struct.omit(request, ['imageUrl'])
    const image = yield* readClientImage(request.imageUrl)

    return yield* ClientImage.$match(image, {
      Untrusted: () => create(withoutImage),
      OwnUpload: ({ key }) =>
        Effect.gen(function* () {
          const plant = yield* create(withoutImage)
          const stored = yield* repo.findById(plant.id)
          if (!stored) return plant

          return yield* gcs.publish(key, plantFolder(plant.id)).pipe(
            Effect.tap(({ url }) =>
              repo.update(plant.id, ownerOf(stored), { imageUrl: url })
            ),
            Effect.map(({ url }) => ({ ...plant, imageUrl: url })),
            Effect.catchTag('GCSPublishError', (error) =>
              Effect.as(
                Effect.logError('Plant created without its scan photo', {
                  plantId: plant.id,
                  error,
                }),
                plant
              )
            )
          )
        }),
    })
  }).pipe(Effect.withSpan('PlantsService.withScanPhoto'))
