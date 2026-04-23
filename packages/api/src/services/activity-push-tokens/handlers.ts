import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { endActivity } from '@lily/api/services/activity-push-tokens/endpoints/end-activity'
import { registerActivityToken } from '@lily/api/services/activity-push-tokens/endpoints/register-activity-token'
import { registerStartToken } from '@lily/api/services/activity-push-tokens/endpoints/register-start-token'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'

export const ActivityPushTokensApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'activityPushTokens', (handlers) =>
    handlers
      .handle('registerStartToken', ({ payload }) =>
        registerStartToken(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('registerActivityToken', ({ payload }) =>
        registerActivityToken(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('endActivity', ({ path: { activityId } }) =>
        endActivity(activityId).pipe(withInfraErrorsAsDefect)
      )
  )
