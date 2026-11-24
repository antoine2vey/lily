import { Authentication } from '@lily/api/services/auth/middleware.types'
import { GCSUploadError } from '@lily/api/services/file/gcs-errors'
import { PlantIdParam } from '@lily/api/services/plants/helpers/plant-id-param'
import { seen } from '@lily/api/services/plants/helpers/seen'
import { Diagnosis, PaginatedResponse, PaginationParams } from '@lily/shared'
import {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const SeenDiagnosisList = PaginatedResponse(Diagnosis.pipe(seen))
export type SeenDiagnosisList = typeof SeenDiagnosisList.Type

export const DiagnosisApi = HttpApiGroup.make('diagnosis')
  .add(
    HttpApiEndpoint.get('getDiagnoses', '/plants/:plantId/diagnoses', {
      params: { plantId: PlantIdParam },
      query: PaginationParams,
      success: SeenDiagnosisList,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .middleware(Authentication)
