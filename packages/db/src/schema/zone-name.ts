import { type ZoneName, zoneNameOrDefault } from '@lily/shared'
import { customType } from 'drizzle-orm/pg-core'

/**
 * A `text` column of zone names that every read decodes to `ZoneName`. A
 * stored name `ZoneName` rejects reads as `DEFAULT_ZONE`.
 */
export const zoneName = customType<{ data: ZoneName; driverData: string }>({
  dataType: () => 'text',
  fromDriver: zoneNameOrDefault,
})
