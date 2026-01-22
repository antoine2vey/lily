import { findCareTasks } from '@lily/api/services/care-tasks/endpoints/find-care-tasks'
import { Effect } from 'effect'

// Care Tasks service implementation
export class CareTasksService extends Effect.Service<CareTasksService>()(
  'CareTasksService',
  {
    effect: Effect.succeed({
      findCareTasks,
    }),
  }
) {}
