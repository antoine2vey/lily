import type { Api } from '@lily/api/api'
import { getDiagnoses } from '@lily/api/services/diagnosis/endpoints/get-diagnoses'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { withPlantKnowledge } from '@lily/api/services/plants/helpers/with-plant-access'
import { parsePaginationParams } from '@lily/shared'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

export const DiagnosisApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'diagnosis', (handlers) =>
    handlers.handle(
      'getDiagnoses',
      ({ params: { plantId }, query: urlParams }) =>
        withPlantKnowledge(plantId, 'diagnose').pipe(
          Effect.flatMap(({ view }) =>
            getDiagnoses({
              plantId,
              view,
              ...parsePaginationParams(urlParams),
            })
          ),
          withInfraErrorsAsDefect
        )
    )
  )
