import type { users } from '@lily/db/schema'
import type { VacationState } from '@lily/shared'

/** Project the vacation columns of a user row into the API response shape. */
export const toVacationState = (
  user: typeof users.$inferSelect
): VacationState => ({
  status: user.vacationStatus,
  startDate: user.vacationStart,
  endDate: user.vacationEnd,
})
