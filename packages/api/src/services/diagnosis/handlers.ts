import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { getDiagnoses } from '@lily/api/services/diagnosis/endpoints/get-diagnoses'
import { resolveDiagnosis } from '@lily/api/services/diagnosis/endpoints/resolve-diagnosis'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { withPlantAuth } from '@lily/api/services/plants/helpers/with-plant-access'
import { parsePaginationParams } from '@lily/shared'
import { Effect } from 'effect'

export const DiagnosisApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'diagnosis', (handlers) =>
    handlers
      .handle('getDiagnoses', ({ path: { plantId }, urlParams }) =>
        withPlantAuth(plantId).pipe(
          Effect.zipRight(
            getDiagnoses({
              plantId,
              ...parsePaginationParams(urlParams),
            })
          ),
          withInfraErrorsAsDefect
        )
      )
      .handle('resolveDiagnosis', ({ path: { diagnosisId } }) =>
        resolveDiagnosis(diagnosisId).pipe(withInfraErrorsAsDefect)
      )
  )
