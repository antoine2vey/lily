import type { Api } from '@lily/api/api'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { getPlantCatalog } from '@lily/api/services/plant-catalog/endpoints/get-plant-catalog'
import { HttpApiBuilder } from 'effect/http-api'

export const PlantCatalogApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'plantCatalog', (handlers) =>
    handlers.handle('getPlantCatalog', ({ query: urlParams }) =>
      getPlantCatalog(urlParams.q).pipe(withInfraErrorsAsDefect)
    )
  )
