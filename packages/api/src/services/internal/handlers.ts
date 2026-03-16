import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { issueServiceToken } from '@lily/api/services/internal/endpoints/issue-service-token'
import { sendInternalMagicLink } from '@lily/api/services/internal/endpoints/send-magic-link'

export const InternalApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'internal', (handlers) =>
    handlers
      .handle('issueServiceToken', ({ payload }) =>
        issueServiceToken(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('sendMagicLink', ({ payload }) =>
        sendInternalMagicLink(payload).pipe(withInfraErrorsAsDefect)
      )
  )
