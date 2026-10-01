import type { Api } from '@lily/api/api'
import { endActivity } from '@lily/api/services/activity-push-tokens/endpoints/end-activity'
import { registerActivityToken } from '@lily/api/services/activity-push-tokens/endpoints/register-activity-token'
import { registerStartToken } from '@lily/api/services/activity-push-tokens/endpoints/register-start-token'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { HttpApiBuilder } from 'effect/http-api'

export const ActivityPushTokensApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'activityPushTokens', (handlers) =>
    handlers
      .handle('registerStartToken', ({ payload }) =>
        registerStartToken(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('registerActivityToken', ({ payload }) =>
        registerActivityToken(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('endActivity', ({ params: { activityId } }) =>
        endActivity(activityId).pipe(withInfraErrorsAsDefect)
      )
  )
