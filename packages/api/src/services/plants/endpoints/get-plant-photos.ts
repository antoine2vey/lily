import type { SqlError } from '@effect/sql/SqlError'
import {
  type FindPhotosParams,
  PlantRepository,
} from '@lily/api/repositories/plant.repository'
import type { PlantPhotosListResponse } from '@lily/shared/plant'
import { Effect } from 'effect'

export const getPlantPhotos = (
  params: FindPhotosParams
): Effect.Effect<PlantPhotosListResponse, SqlError, PlantRepository> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    return yield* repo.findPhotos(params)
  })
