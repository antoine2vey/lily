import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DiagnosisRepositoryLive } from '@lily/api/repositories/diagnosis.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { DiagnosisService } from '@lily/api/services/diagnosis/service'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { withPlantAuth } from '@lily/api/services/plants/helpers/with-plant-access'
import { GCSService } from '@lily/shared/services/file/gcs'
import { Effect, Layer } from 'effect'

export const DiagnosisApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'diagnosis', (handlers) =>
    Effect.gen(function* () {
      const service = yield* DiagnosisService

      return handlers
        .handle('getDiagnoses', ({ path: { plantId }, urlParams }) =>
          service
            .getDiagnoses({
              plantId,
              page: parseInt(urlParams.page, 10) || 1,
              limit: parseInt(urlParams.limit, 10) || 20,
            })
            .pipe(withPlantAuth(plantId), withInfraErrorsAsDefect)
        )
        .handle('resolveDiagnosis', ({ path: { diagnosisId } }) =>
          service.resolveDiagnosis(diagnosisId).pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(DiagnosisService.Default),
    Layer.provide(DiagnosisRepositoryLive),
    Layer.provide(PlantRepositoryLive),
    Layer.provide(DelegationRepositoryLive),
    Layer.provide(AuthenticationLive),
    Layer.provide(GCSService.Default)
  )
