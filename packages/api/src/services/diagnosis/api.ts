import { Authentication } from '@lily/api/services/auth/middleware.types'
import { DiagnosisListResponse, PaginationParams } from '@lily/shared'
import {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { GCSUploadError } from '@lily/shared/services/file/gcs-errors'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const plantIdParam = Schema.String.check(Schema.isGUID())

export const DiagnosisApi = HttpApiGroup.make('diagnosis')
  .add(
    HttpApiEndpoint.get('getDiagnoses', '/plants/:plantId/diagnoses', {
      params: { plantId: plantIdParam },
      query: PaginationParams,
      success: DiagnosisListResponse,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .middleware(Authentication)
