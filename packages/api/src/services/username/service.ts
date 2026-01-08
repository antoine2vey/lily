import { checkUsername } from '@lily/api/services/username/endpoints/check-username'
import { Effect } from 'effect'

// Username service implementation
export class UsernameService extends Effect.Service<UsernameService>()(
  'UsernameService',
  {
    effect: Effect.succeed({
      checkUsername,
    }),
  }
) {}
