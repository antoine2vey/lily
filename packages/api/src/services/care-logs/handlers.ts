import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { deleteCareLog } from '@lily/api/services/care-logs/endpoints/delete-care-log'
import { getCareLog } from '@lily/api/services/care-logs/endpoints/get-care-log'
import { getCareLogs } from '@lily/api/services/care-logs/endpoints/get-care-logs'
import { getRecentActivities } from '@lily/api/services/care-logs/endpoints/get-recent-activities'
import { updateCareLog } from '@lily/api/services/care-logs/endpoints/update-care-log'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { withPlantAuth } from '@lily/api/services/plants/helpers/with-plant-access'
import { Effect } from 'effect'

export const CareLogsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'careLogs', (handlers) =>
    handlers
      .handle('getRecentActivities', ({ urlParams }) =>
        getRecentActivities({
          limit: parseInt(urlParams.limit, 10) || 10,
        }).pipe(withInfraErrorsAsDefect)
      )
      .handle('getCareLogs', ({ path: { plantId }, urlParams }) =>
        withPlantAuth(plantId).pipe(
          Effect.zipRight(
            getCareLogs({
              plantId,
              page: parseInt(urlParams.page, 10) || 1,
              limit: parseInt(urlParams.limit, 10) || 20,
              type:
                urlParams.type === 'watering' ||
                urlParams.type === 'fertilization'
                  ? urlParams.type
                  : 'all',
            })
          ),
          withInfraErrorsAsDefect
        )
      )
      .handle('createCareLog', ({ path: { plantId }, payload }) =>
        withPlantAuth(plantId).pipe(
          Effect.zipRight(createCareLog(plantId, payload)),
          withInfraErrorsAsDefect
        )
      )
      .handle('getCareLog', ({ path: { plantId, logId } }) =>
        withPlantAuth(plantId).pipe(
          Effect.zipRight(getCareLog(plantId, logId)),
          withInfraErrorsAsDefect
        )
      )
      .handle('updateCareLog', ({ path: { plantId, logId }, payload }) =>
        withPlantAuth(plantId).pipe(
          Effect.zipRight(updateCareLog(plantId, logId, payload)),
          withInfraErrorsAsDefect
        )
      )
      .handle('deleteCareLog', ({ path: { plantId, logId } }) =>
        withPlantAuth(plantId).pipe(
          Effect.zipRight(deleteCareLog(plantId, logId)),
          withInfraErrorsAsDefect
        )
      )
  )
