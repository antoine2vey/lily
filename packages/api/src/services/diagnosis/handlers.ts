import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { DiagnosisRepositoryLive } from '@lily/api/repositories/diagnosis.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { DiagnosisService } from '@lily/api/services/diagnosis/service'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
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
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('resolveDiagnosis', ({ path: { diagnosisId } }) =>
          service.resolveDiagnosis(diagnosisId).pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(DiagnosisService.Default),
    Layer.provide(DiagnosisRepositoryLive),
    Layer.provide(AuthenticationLive)
  )
