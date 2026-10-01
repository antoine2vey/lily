import { Authentication } from '@lily/api/services/auth/middleware.types'
import { CatalogPlantListResponse } from '@lily/shared'
import { Effect, Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'

export const PlantCatalogApi = HttpApiGroup.make('plantCatalog')
  .add(
    HttpApiEndpoint.get('getPlantCatalog', '/', {
      query: Schema.Struct({
        q: Schema.String.pipe(
          Schema.withDecodingDefaultType(Effect.succeed('')),
          Schema.withConstructorDefault(Effect.succeed(''))
        ),
      }),
      success: CatalogPlantListResponse,
    })
  )
  .prefix('/plant-catalog')
  .middleware(Authentication)
