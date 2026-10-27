import { Option, pipe } from 'effect'

export const hasUserOwner = <R extends { readonly userId: string | null }>(
  row: R
): row is R & { readonly userId: string } => row.userId !== null

export const userOwnedOrNull = <R extends { readonly userId: string | null }>(
  row: R | undefined
): (R & { readonly userId: string }) | null =>
  pipe(Option.fromNullishOr(row), Option.filter(hasUserOwner), Option.getOrNull)
