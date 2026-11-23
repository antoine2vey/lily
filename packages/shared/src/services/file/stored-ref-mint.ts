import { Brand } from 'effect'
import type { StoredObjectRef } from './stored-object'

/**
 * The one constructor of `StoredObjectRef`. The architecture test
 * `stored-ref-mint.test.ts` in the api names the modules that may import it.
 */
export const mintStoredRef = Brand.nominal<StoredObjectRef>()
