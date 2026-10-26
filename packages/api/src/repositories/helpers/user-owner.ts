/**
 * A Canopy plant or room has no user owner (`user_id IS NULL`). Until
 * owner-based access lands, repositories hand out only rows a user owns and
 * treat the rest as absent.
 */
export const hasUserOwner = <R extends { readonly userId: string | null }>(
  row: R
): row is R & { readonly userId: string } => row.userId !== null

export const userOwnedOrNull = <R extends { readonly userId: string | null }>(
  row: R | undefined
): (R & { readonly userId: string }) | null =>
  row !== undefined && hasUserOwner(row) ? row : null
