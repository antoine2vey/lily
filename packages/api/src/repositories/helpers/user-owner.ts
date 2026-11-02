export const hasUserOwner = <R extends { readonly userId: string | null }>(
  row: R
): row is R & { readonly userId: string } => row.userId !== null
