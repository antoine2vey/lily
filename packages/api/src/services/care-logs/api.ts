import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { PaginationParams } from '@lily/shared'
import {
  CareLog,
  CareLogCreateRequest,
  CareLogsListResponse,
  CareLogUpdateRequest,
} from '@lily/shared/care-log'
import { DatabaseError } from '@lily/shared/errors/database'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Schema } from 'effect'

// Path parameters
const plantIdParam = HttpApiSchema.param('plantId', Schema.String)
const logIdParam = HttpApiSchema.param('logId', Schema.String)

// Query parameters for care logs listing (extends base pagination)
export const CareLogsQueryParams = Schema.Struct({
  ...PaginationParams.fields,
  type: Schema.optionalWith(Schema.String, { default: () => 'all' }),
})

// Define the Care Logs API group - nested under plants
export const CareLogsApi = HttpApiGroup.make('careLogs')
  .add(
    // GET /plants/:plantId/logs - List care logs (filter by type)
    HttpApiEndpoint.get('getCareLogs')`/plants/${plantIdParam}/logs`
      .setUrlParams(CareLogsQueryParams)
      .addSuccess(CareLogsListResponse)
      .addError(DatabaseError, { status: 500 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/:plantId/logs - Add a log entry
    HttpApiEndpoint.post('createCareLog')`/plants/${plantIdParam}/logs`
      .setPayload(CareLogCreateRequest)
      .addSuccess(CareLog, { status: 201 })
      .addError(DatabaseError, { status: 500 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // GET /plants/:plantId/logs/:logId - Get a single log entry
    HttpApiEndpoint.get(
      'getCareLog'
    )`/plants/${plantIdParam}/logs/${logIdParam}`
      .addSuccess(CareLog)
      .addError(DatabaseError, { status: 500 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // PUT /plants/:plantId/logs/:logId - Update a log entry
    HttpApiEndpoint.put(
      'updateCareLog'
    )`/plants/${plantIdParam}/logs/${logIdParam}`
      .setPayload(CareLogUpdateRequest)
      .addSuccess(CareLog)
      .addError(DatabaseError, { status: 500 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // DELETE /plants/:plantId/logs/:logId - Delete a log entry
    HttpApiEndpoint.del(
      'deleteCareLog'
    )`/plants/${plantIdParam}/logs/${logIdParam}`
      .addSuccess(Schema.Struct({ message: Schema.String }))
      .addError(DatabaseError, { status: 500 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
