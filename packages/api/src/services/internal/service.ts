import { issueServiceToken } from '@lily/api/services/internal/endpoints/issue-service-token'
import { sendInternalMagicLink } from '@lily/api/services/internal/endpoints/send-magic-link'
import { Effect } from 'effect'

export class InternalService extends Effect.Service<InternalService>()(
  'InternalService',
  {
    effect: Effect.succeed({
      issueServiceToken,
      sendInternalMagicLink,
    }),
  }
) {}
