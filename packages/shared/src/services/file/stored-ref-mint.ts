import { Brand } from 'effect'

/**
 * A reference to a stored object that the server made: the URL or key of an
 * upload it wrote, or of a client upload `readClientImage` or
 * `readIssuedAvatar` read. A `storedRef()` column takes only this type, so a
 * write needs a reference from `mintStoredRef`.
 */
export type StoredObjectRef = string & Brand.Brand<'StoredObjectRef'>

/**
 * The constructor of `StoredObjectRef`. `context-boundaries.test.ts` in the
 * api lists the modules that may name or load it, and fails on a cast to the
 * type or a brand of its name in any other module.
 */
export const mintStoredRef = Brand.nominal<StoredObjectRef>()
