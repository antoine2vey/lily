import type { StoredObjectRef } from '@lily/shared/services/file/stored-object'
import { mintStoredRef } from '@lily/shared/services/file/stored-ref-mint'
import type { Column } from 'drizzle-orm'
import { customType } from 'drizzle-orm/pg-core'

const fromDriver = (value: string) => mintStoredRef(value)

/**
 * A text column that holds a reference to a stored object. Its value is a
 * `StoredObjectRef`, so a write needs a reference the server minted. The
 * release check and the orphan sweep read every column of this type.
 */
export const storedRef = customType<{
  data: StoredObjectRef
  driverData: string
}>({ dataType: () => 'text', fromDriver })

export const isStoredRefColumn = (column: Column): boolean =>
  Reflect.get(column, 'mapFrom') === fromDriver
