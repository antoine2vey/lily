import { Authentication } from '@lily/api/services/auth/middleware.types'
import { CareTasksResponse } from '@lily/shared'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

// Opt-in so app builds from before Canopy never receive a Canopy task.
export const CareTasksQueryParams = Schema.Struct({
  includeCanopy: Schema.optional(Schema.String),
})

export const CareTasksApi = HttpApiGroup.make('careTasks')
  .add(
    // GET /care-tasks - Get care tasks grouped by date
    HttpApiEndpoint.get('getCareTasks', '/', {
      query: CareTasksQueryParams,
      success: CareTasksResponse,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .prefix('/care-tasks')
  .middleware(Authentication)
