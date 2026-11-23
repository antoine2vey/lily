import { Brand } from 'effect'
import type { StoredObjectRef } from './stored-object'

/**
 * The one constructor of `StoredObjectRef`. The `noRestrictedImports` entry
 * of `biome.json` names the modules that may import it.
 */
export const mintStoredRef = Brand.nominal<StoredObjectRef>()
