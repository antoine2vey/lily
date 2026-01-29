import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import { CareTasksResponse } from '@lily/shared'
import { Schema } from 'effect'

// Define the Care Tasks API group
export const CareTasksApi = HttpApiGroup.make('careTasks')
  .add(
    // GET /care-tasks - Get care tasks grouped by date
    HttpApiEndpoint.get('getCareTasks')`/`
      .addSuccess(CareTasksResponse)
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .prefix('/care-tasks')
  .middleware(Authentication)
