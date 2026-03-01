import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  DiagnosisListResponse,
  DiagnosisNotFoundError,
  PaginationParams,
} from '@lily/shared'
import { Diagnosis } from '@lily/shared/diagnosis'
import {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Schema } from 'effect'

const plantIdParam = HttpApiSchema.param('plantId', Schema.UUID)
const diagnosisIdParam = HttpApiSchema.param('diagnosisId', Schema.UUID)

export const DiagnosisApi = HttpApiGroup.make('diagnosis')
  .add(
    HttpApiEndpoint.get('getDiagnoses')`/plants/${plantIdParam}/diagnoses`
      .setUrlParams(PaginationParams)
      .addSuccess(DiagnosisListResponse)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    HttpApiEndpoint.patch(
      'resolveDiagnosis'
    )`/plants/${plantIdParam}/diagnoses/${diagnosisIdParam}/resolve`
      .addSuccess(Diagnosis)
      .addError(DiagnosisNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .middleware(Authentication)
