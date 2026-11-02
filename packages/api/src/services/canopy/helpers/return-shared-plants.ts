import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { rescheduleReminders } from '@lily/api/services/plants/helpers/reschedule-reminders'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Hands every plant a member shared, alive or dead, back to them as a personal
 * plant with no room, and rebuilds its reminders for them. No plant-limit
 * check: a returned plant is not a new plant. Run under the Canopy lock.
 */
export const returnSharedPlants = (
  canopyId: string,
  sharerId: string
): Effect.Effect<
  void,
  SqlError,
  | CanopyRepository
  | CareScheduleRepository
  | NotificationRepository
  | UserRepository
  | DelegationRepository
> =>
  Effect.flatMap(CanopyRepository, (repo) =>
    repo.returnToSharer(canopyId, sharerId)
  ).pipe(
    Effect.flatMap((returned) =>
      Effect.forEach(
        returned,
        (plant) => rescheduleReminders(plant, sharerId),
        {
          discard: true,
        }
      )
    ),
    Effect.withSpan('returnSharedPlants', {
      attributes: { 'canopy.id': canopyId, 'user.id': sharerId },
    })
  )
