import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import { CatalogPlantListResponse } from '@lily/shared'
import { Schema } from 'effect'

export const PlantCatalogApi = HttpApiGroup.make('plantCatalog')
  .add(
    HttpApiEndpoint.get('getPlantCatalog')`/`
      .addSuccess(CatalogPlantListResponse)
      .setUrlParams(
        Schema.Struct({
          q: Schema.optionalWith(Schema.String, {
            default: () => '',
          }),
        })
      )
  )
  .prefix('/plant-catalog')
  .middleware(Authentication)
