import type { Vacation } from '@lily/api/contexts/absence'
import type { users } from '@lily/db/schema'
import type { VacationState } from '@lily/shared'
import { DateTime, Match } from 'effect'

/** Project the vacation columns of a user row into the API response shape. */
export const toVacationState = (
  user: typeof users.$inferSelect
): VacationState => ({
  status: user.vacationStatus,
  startDate: user.vacationStart,
  endDate: user.vacationEnd,
})

export const NO_VACATION: VacationState = {
  status: 'none',
  startDate: null,
  endDate: null,
}

export const fromVacation: (vacation: Vacation) => VacationState =
  Match.type<Vacation>().pipe(
    Match.tagsExhaustive({
      None: () => NO_VACATION,
      Scheduled: ({ start, end }) => ({
        status: 'scheduled' as const,
        startDate: DateTime.toDateUtc(start),
        endDate: DateTime.toDateUtc(end),
      }),
      Active: ({ start, end }) => ({
        status: 'active' as const,
        startDate: DateTime.toDateUtc(start),
        endDate: DateTime.toDateUtc(end),
      }),
    })
  )
