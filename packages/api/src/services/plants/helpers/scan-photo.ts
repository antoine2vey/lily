import { ownerOf } from '@lily/api/repositories/helpers/plant-owner'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { EnhancedPlantCreateRequest, Plant } from '@lily/shared/plant'
import { GCSService } from '@lily/shared/services/file/gcs'
import {
  plantFolder,
  scopePrefix,
} from '@lily/shared/services/file/stored-object'
import { Effect, Option, pipe, Struct } from 'effect'

/**
 * Creates a plant from a request whose image may be a scan photo. A scan
 * answers with a signed URL of the private bucket, which expires, so the
 * plant gets a public copy of the caller's own scan photo instead. Any other
 * private object is not the caller's to show and the plant gets no image.
 */
export const withScanPhoto = <E, R>(
  request: EnhancedPlantCreateRequest,
  create: (request: EnhancedPlantCreateRequest) => Effect.Effect<Plant, E, R>
) =>
  Effect.gen(function* () {
    const gcs = yield* GCSService
    const repo = yield* PlantRepository
    const { id: userId } = yield* CurrentUser

    const privateKey = pipe(
      Option.fromNullishOr(request.imageUrl),
      Option.flatMap(gcs.locate),
      Option.filter((object) => object.bucket === 'ai'),
      Option.map((object) => object.key)
    )
    if (Option.isNone(privateKey)) return yield* create(request)

    const plant = yield* create(Struct.omit(request, ['imageUrl']))
    const stored = yield* repo.findById(plant.id)
    if (
      !stored ||
      !privateKey.value.startsWith(scopePrefix({ _tag: 'User', userId }))
    ) {
      return plant
    }

    return yield* gcs.publish(privateKey.value, plantFolder(plant.id)).pipe(
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
  }).pipe(Effect.withSpan('PlantsService.withScanPhoto'))
