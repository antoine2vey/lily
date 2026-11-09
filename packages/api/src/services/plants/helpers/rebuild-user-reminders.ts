import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { changeMember } from '@lily/api/services/plants/helpers/plant-change'
import {
  type ReminderContext,
  rebuildMemberReminders,
  rescheduleReminders,
} from '@lily/api/services/plants/helpers/reconcile-reminders'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const withUserRemindersRebuilt =
  (userId: string) =>
  <A, E, R>(
    change: Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | SqlError,
    R | ReminderContext | DelegationRepository
  > =>
    changeMember(userId)(({ personal, canopy }) =>
      change.pipe(
        Effect.tap(() =>
          rescheduleReminders(personal).pipe(
            Effect.andThen(rebuildMemberReminders(userId, canopy))
          )
        )
      )
    )
