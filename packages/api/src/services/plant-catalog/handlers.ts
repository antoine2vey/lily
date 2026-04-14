import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { getPlantCatalog } from '@lily/api/services/plant-catalog/endpoints/get-plant-catalog'

export const PlantCatalogApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'plantCatalog', (handlers) =>
    handlers.handle('getPlantCatalog', ({ urlParams }) =>
      getPlantCatalog(urlParams.q).pipe(withInfraErrorsAsDefect)
    )
  )
