import type { Api } from '@lily/api/api'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { deleteCareLog } from '@lily/api/services/care-logs/endpoints/delete-care-log'
import { getCareLog } from '@lily/api/services/care-logs/endpoints/get-care-log'
import { getCareLogs } from '@lily/api/services/care-logs/endpoints/get-care-logs'
import { getRecentActivities } from '@lily/api/services/care-logs/endpoints/get-recent-activities'
import { updateCareLog } from '@lily/api/services/care-logs/endpoints/update-care-log'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { withPlantAuth } from '@lily/api/services/plants/helpers/with-plant-access'
import { parsePaginationParams } from '@lily/shared'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

export const CareLogsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'careLogs', (handlers) =>
    handlers
      .handle('getRecentActivities', ({ query: urlParams }) =>
        getRecentActivities({
          limit: parseInt(urlParams.limit, 10) || 10,
        }).pipe(withInfraErrorsAsDefect)
      )
      .handle('getCareLogs', ({ params: { plantId }, query: urlParams }) =>
        withPlantAuth(plantId).pipe(
          Effect.andThen(
            getCareLogs({
              plantId,
              ...parsePaginationParams(urlParams),
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
      .handle('createCareLog', ({ params: { plantId }, payload }) =>
        withPlantAuth(plantId).pipe(
          Effect.andThen(createCareLog(plantId, payload)),
          withInfraErrorsAsDefect
        )
      )
      .handle('getCareLog', ({ params: { plantId, logId } }) =>
        withPlantAuth(plantId).pipe(
          Effect.andThen(getCareLog(plantId, logId)),
          withInfraErrorsAsDefect
        )
      )
      .handle('updateCareLog', ({ params: { plantId, logId }, payload }) =>
        withPlantAuth(plantId).pipe(
          Effect.andThen(updateCareLog(plantId, logId, payload)),
          withInfraErrorsAsDefect
        )
      )
      .handle('deleteCareLog', ({ params: { plantId, logId } }) =>
        withPlantAuth(plantId).pipe(
          Effect.andThen(deleteCareLog(plantId, logId)),
          withInfraErrorsAsDefect
        )
      )
  )
