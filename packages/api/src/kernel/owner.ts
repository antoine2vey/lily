import type { PlantOwner } from '@lily/shared'

declare const OwnerHeldBrand: unique symbol

/**
 * Proof that the current transaction holds the lock of `owner`, so the count
 * of its living plants cannot move before the commit. It means nothing
 * outside the transaction that minted it.
 */
export interface OwnerHeld {
  readonly owner: PlantOwner
  readonly [OwnerHeldBrand]: true
}

/** Only `withOwnerLock` may call this, once it holds the lock. */
export const mintOwnerHeld = (owner: PlantOwner): OwnerHeld =>
  ({ owner }) as OwnerHeld
