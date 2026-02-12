import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  DiagnosisListResponse,
  DiagnosisNotFoundError,
  PaginationParams,
} from '@lily/shared'
import { Diagnosis } from '@lily/shared/diagnosis'
import { Schema } from 'effect'

const plantIdParam = HttpApiSchema.param('plantId', Schema.String)
const diagnosisIdParam = HttpApiSchema.param('diagnosisId', Schema.String)

export const DiagnosisApi = HttpApiGroup.make('diagnosis')
  .add(
    HttpApiEndpoint.get('getDiagnoses')`/plants/${plantIdParam}/diagnoses`
      .setUrlParams(PaginationParams)
      .addSuccess(DiagnosisListResponse)
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
