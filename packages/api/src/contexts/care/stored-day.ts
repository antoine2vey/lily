import { plantCareSchedules } from '@lily/db/schema'
import { CareDay, CareDays } from '@lily/shared'
import { and, isNull, lt, lte, or } from 'drizzle-orm'
import { DateTime } from 'effect'

export const storedDay = (
  day: string | null,
  instant: Date,
  timezone: string
): CareDay =>
  day === null
    ? CareDays.of(DateTime.makeUnsafe(instant), timezone)
    : CareDay.make(day)

export const dueOnOrBefore = (day: CareDay, undatedBefore: Date) =>
  or(
    lte(plantCareSchedules.dueDay, day),
    and(
      isNull(plantCareSchedules.dueDay),
      lt(plantCareSchedules.nextCareAt, undatedBefore)
    )
  )
