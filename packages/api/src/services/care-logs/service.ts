import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { deleteCareLog } from '@lily/api/services/care-logs/endpoints/delete-care-log'
import { getCareLog } from '@lily/api/services/care-logs/endpoints/get-care-log'
import { getCareLogs } from '@lily/api/services/care-logs/endpoints/get-care-logs'
import { getRecentActivities } from '@lily/api/services/care-logs/endpoints/get-recent-activities'
import { updateCareLog } from '@lily/api/services/care-logs/endpoints/update-care-log'
import { Effect } from 'effect'

// Care Logs service implementation
export class CareLogsService extends Effect.Service<CareLogsService>()(
  'CareLogsService',
  {
    effect: Effect.succeed({
      getCareLogs,
      getRecentActivities,
      createCareLog,
      getCareLog,
      updateCareLog,
      deleteCareLog,
    }),
  }
) {}
