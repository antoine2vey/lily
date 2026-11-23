import { Brand } from 'effect'

/**
 * A reference to a stored object that the server made: the URL or key of an
 * upload it wrote, or of a client upload `readClientImage` or
 * `readIssuedAvatar` read. A `storedRef()` column takes only this type, so a
 * write needs a reference from `mintStoredRef`.
 */
export type StoredObjectRef = string & Brand.Brand<'StoredObjectRef'>

/**
 * The constructor of `StoredObjectRef`. The `noRestrictedImports` entry of
 * `biome.json` names the modules that may import it, and
 * `context-boundaries.test.ts` in the api fails on a cast to the type or a
 * brand of the same name made in any other module.
 */
export const mintStoredRef = Brand.nominal<StoredObjectRef>()
