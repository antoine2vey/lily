import {
  mintStoredRef,
  type StoredObjectRef,
} from '@lily/shared/services/file/stored-ref-mint'
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

/**
 * A json or jsonb column whose documents hold references, and the JSON path
 * of the references in each document. A column type cannot mark a value
 * inside a document, so `stored-ref-columns.test.ts` fails on a json column
 * that is neither here nor on its allowlist.
 */
export const JSON_REF_HOLDERS = [
  {
    table: 'chat_messages',
    column: 'parts',
    path: '$[*] ? (@.type == "file").url',
  },
] as const
