import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { requireOwner } from '@lily/api/services/canopy/helpers/membership'
import { changeMyCanopy } from '@lily/api/services/plants/helpers/plant-change'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reconcile-reminders'
import type { UpdateCanopyRequest } from '@lily/shared'
import { Array, Effect } from 'effect'

export const updateMyCanopy = Effect.fn('CanopyService.updateMyCanopy')(
  function* (request: UpdateCanopyRequest) {
    const { id: userId } = yield* CurrentUser
    const repo = yield* CanopyRepository

    const canopyId = yield* changeMyCanopy(userId)(
      ({ canopy, membership }, plantIds) =>
        Effect.gen(function* () {
          const { name, timezone, latitude, longitude } = request
          const changesSettings = Array.some(
            [timezone, latitude, longitude],
            (value) => value !== undefined
          )
          if (changesSettings) {
            yield* requireOwner(membership)
          }
          if (timezone !== undefined && timezone !== canopy.timezone) {
            yield* repo.update(canopy.id, request)
            yield* rescheduleReminders(plantIds)
          } else if (changesSettings || name !== undefined) {
            yield* repo.update(canopy.id, request)
          }
          return canopy.id
        })
    )

    return yield* canopyView(canopyId, userId)
  }
)
