import { Authentication } from '@lily/api/services/auth/middleware.types'
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
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Effect, Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

// Path parameters
const plantIdParam = Schema.String.check(Schema.isGUID())
const logIdParam = Schema.String.check(Schema.isGUID())

// Query parameters for care logs listing (extends base pagination)
export const CareLogsQueryParams = Schema.Struct({
  ...PaginationParams.fields,
  type: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('all')),
    Schema.withConstructorDefault(Effect.succeed('all'))
  ),
})

// Query params for recent activities
export const RecentActivitiesQueryParams = Schema.Struct({
  limit: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('10')),
    Schema.withConstructorDefault(Effect.succeed('10'))
  ),
})

// Define the Care Logs API group - nested under plants
export const CareLogsApi = HttpApiGroup.make('careLogs')
  .add(
    // GET /care-logs/recent - Get recent activities across all plants
    HttpApiEndpoint.get('getRecentActivities', '/care-logs/recent', {
      query: RecentActivitiesQueryParams,
      success: RecentActivitiesListResponse,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    // GET /plants/:plantId/logs - List care logs (filter by type)
    HttpApiEndpoint.get('getCareLogs', '/plants/:plantId/logs', {
      params: { plantId: plantIdParam },
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
    // POST /plants/:plantId/logs - Add a log entry
    HttpApiEndpoint.post('createCareLog', '/plants/:plantId/logs', {
      params: { plantId: plantIdParam },
      payload: CareLogCreateRequest,
      success: CareLog.pipe(HttpApiSchema.status(201)),
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(400)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // GET /plants/:plantId/logs/:logId - Get a single log entry
    HttpApiEndpoint.get('getCareLog', '/plants/:plantId/logs/:logId', {
      params: { plantId: plantIdParam, logId: logIdParam },
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
    // PUT /plants/:plantId/logs/:logId - Update a log entry
    HttpApiEndpoint.put('updateCareLog', '/plants/:plantId/logs/:logId', {
      params: { plantId: plantIdParam, logId: logIdParam },
      payload: CareLogUpdateRequest,
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
    // DELETE /plants/:plantId/logs/:logId - Delete a log entry
    HttpApiEndpoint.delete('deleteCareLog', '/plants/:plantId/logs/:logId', {
      params: { plantId: plantIdParam, logId: logIdParam },
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
