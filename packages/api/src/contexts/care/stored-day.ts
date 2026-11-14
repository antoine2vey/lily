import { plantCareSchedules } from '@lily/db/schema'
import type { CareDay } from '@lily/shared'
import { lte } from 'drizzle-orm'

export const dueOnOrBefore = (day: CareDay) =>
  lte(plantCareSchedules.dueDay, day)
