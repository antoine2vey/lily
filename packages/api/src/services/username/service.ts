import { Effect } from 'effect'
import { checkUsername } from './endpoints/check-username'

// Username service implementation
export class UsernameService extends Effect.Service<UsernameService>()(
  'UsernameService',
  {
    effect: Effect.succeed({
      checkUsername,
    }),
  }
) {}
