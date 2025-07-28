import { Effect } from 'effect'
import { createCareLog } from './endpoints/create-care-log'
import { deleteCareLog } from './endpoints/delete-care-log'
import { getCareLog } from './endpoints/get-care-log'
import { getCareLogs } from './endpoints/get-care-logs'
import { updateCareLog } from './endpoints/update-care-log'

// Care Logs service implementation
export class CareLogsService extends Effect.Service<CareLogsService>()(
  'CareLogsService',
  {
    effect: Effect.succeed({
      getCareLogs,
      createCareLog,
      getCareLog,
      updateCareLog,
      deleteCareLog,
    }),
  }
) {}
