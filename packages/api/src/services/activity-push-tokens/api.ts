import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  ActivityPushToken,
  RegisterActivityTokenRequest,
  RegisterStartTokenRequest,
} from '@lily/shared'
import { Schema } from 'effect'

const activityIdParam = HttpApiSchema.param('activityId', Schema.String)

export const ActivityPushTokensApi = HttpApiGroup.make('activityPushTokens')
  .add(
    // POST /activity-push-tokens/start — register a push-to-start token.
    // Called once per device when ActivityKit streams a (new) token.
    HttpApiEndpoint.post('registerStartToken')`/start`
      .setPayload(RegisterStartTokenRequest)
      .addSuccess(ActivityPushToken, { status: 201 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /activity-push-tokens — register an update token for an already
    // running activity (fires when a push-started activity emits its first
    // pushTokenUpdates value on-device).
    HttpApiEndpoint.post('registerActivityToken')`/`
      .setPayload(RegisterActivityTokenRequest)
      .addSuccess(ActivityPushToken, { status: 201 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // PUT /activity-push-tokens/:activityId/end — mark activity as ended.
    // Called when the app dismisses it locally; server-side dismiss is done
    // via sendLiveActivity + repo.markEnded from the event handler.
    HttpApiEndpoint.put('endActivity')`/${activityIdParam}/end`
      .addSuccess(Schema.Struct({ message: Schema.String }))
      .addError(Schema.Struct({ error: Schema.String }), { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .prefix('/activity-push-tokens')
  .middleware(Authentication)
