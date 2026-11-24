import { Authentication } from '@lily/api/services/auth/middleware.types'
import { GCSUploadError } from '@lily/api/services/file/gcs-errors'
import { InvalidImageError } from '@lily/api/services/file/image-upload'
import { PlantIdParam } from '@lily/api/services/plants/helpers/plant-id-param'
import { PaginationParams } from '@lily/shared'
import {
  CareLog,
  CareLogCreateRequest,
  CareLogNotFoundError,
  CareLogsListResponse,
  CareLogUpdateRequest,
  RecentActivitiesListResponse,
} from '@lily/shared/care-log'
import {
  AlreadyCaredTodayError,
  FutureDateNotAllowedError,
  PlantIsDeadError,
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Effect, Schema } from 'effect'
import { Multipart } from 'effect/http'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const logIdParam = Schema.String.check(Schema.isGUID())

export const CareLogsQueryParams = Schema.Struct({
  ...PaginationParams.fields,
  type: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('all')),
    Schema.withConstructorDefault(Effect.succeed('all'))
  ),
})

export const RecentActivitiesQueryParams = Schema.Struct({
  limit: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('10')),
    Schema.withConstructorDefault(Effect.succeed('10'))
  ),
})

const CareLogCreateUpload = Schema.Struct({
  data: Schema.fromJsonString(CareLogCreateRequest),
  image: Multipart.SingleFileSchema,
}).pipe(HttpApiSchema.asMultipart())

export const CareLogsApi = HttpApiGroup.make('careLogs')
  .add(
    HttpApiEndpoint.get('getRecentActivities', '/care-logs/recent', {
      query: RecentActivitiesQueryParams,
      success: RecentActivitiesListResponse,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    HttpApiEndpoint.get('getCareLogs', '/plants/:plantId/logs', {
      params: { plantId: PlantIdParam },
      query: CareLogsQueryParams,
      success: CareLogsListResponse,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // POST /plants/:plantId/logs - Add a log entry, as JSON or as multipart
    // with the photo
    HttpApiEndpoint.post('createCareLog', '/plants/:plantId/logs', {
      params: { plantId: PlantIdParam },
      payload: [CareLogCreateRequest, CareLogCreateUpload],
      success: CareLog.pipe(HttpApiSchema.status(201)),
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        FutureDateNotAllowedError,
        AlreadyCaredTodayError,
        PlantIsDeadError,
        InvalidImageError,
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(400)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.get('getCareLog', '/plants/:plantId/logs/:logId', {
      params: { plantId: PlantIdParam, logId: logIdParam },
      success: CareLog,
      error: [
        CareLogNotFoundError,
        PlantNotFoundError,
        PlantNotAuthorizedError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.put('updateCareLog', '/plants/:plantId/logs/:logId', {
      params: { plantId: PlantIdParam, logId: logIdParam },
      payload: CareLogUpdateRequest,
      success: CareLog,
      error: [
        CareLogNotFoundError,
        PlantNotFoundError,
        PlantNotAuthorizedError,
        FutureDateNotAllowedError,
        AlreadyCaredTodayError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete('deleteCareLog', '/plants/:plantId/logs/:logId', {
      params: { plantId: PlantIdParam, logId: logIdParam },
      success: Schema.Struct({ message: Schema.String }),
      error: [
        CareLogNotFoundError,
        PlantNotFoundError,
        PlantNotAuthorizedError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .middleware(Authentication)
