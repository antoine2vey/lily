import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  ActivityPushToken,
  RegisterActivityTokenRequest,
  RegisterStartTokenRequest,
} from '@lily/shared'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const activityIdParam = Schema.String

export const ActivityPushTokensApi = HttpApiGroup.make('activityPushTokens')
  .add(
    // POST /activity-push-tokens/start — register a push-to-start token.
    // Called once per device when ActivityKit streams a (new) token.
    HttpApiEndpoint.post('registerStartToken', '/start', {
      payload: RegisterStartTokenRequest,
      success: ActivityPushToken.pipe(HttpApiSchema.status(201)),
      error: [
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(400)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // POST /activity-push-tokens — register an update token for an already
    // running activity (fires when a push-started activity emits its first
    // pushTokenUpdates value on-device).
    HttpApiEndpoint.post('registerActivityToken', '/', {
      payload: RegisterActivityTokenRequest,
      success: ActivityPushToken.pipe(HttpApiSchema.status(201)),
      error: [
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(400)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // PUT /activity-push-tokens/:activityId/end — mark activity as ended.
    // Called when the app dismisses it locally; server-side dismiss is done
    // via sendLiveActivity + repo.markEnded from the event handler.
    HttpApiEndpoint.put('endActivity', '/:activityId/end', {
      params: { activityId: activityIdParam },
      success: Schema.Struct({ message: Schema.String }),
      error: [
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(404)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .prefix('/activity-push-tokens')
  .middleware(Authentication)
