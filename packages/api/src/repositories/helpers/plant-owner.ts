import type { CanopyId, PlantOwner } from '@lily/shared'
import { type Column, eq } from 'drizzle-orm'
import { Option, pipe } from 'effect'

export interface OwnerColumns {
  readonly userId: string | null
  readonly canopyId: string | null
}

export type UserOwner = Extract<PlantOwner, { _tag: 'User' }>
export type CanopyOwner = Extract<PlantOwner, { _tag: 'Canopy' }>

export type WithOwner<R extends OwnerColumns> = R & {
  readonly owner: PlantOwner
}

export const ownerOf = (row: OwnerColumns): PlantOwner =>
  pipe(
    Option.fromNullishOr(row.userId),
    Option.match({
      onSome: (userId): PlantOwner => ({ _tag: 'User', userId }),
      onNone: (): PlantOwner => ({
        _tag: 'Canopy',
        canopyId: pipe(
          Option.fromNullishOr(row.canopyId),
          Option.getOrThrowWith(
            () => new Error('row has neither user_id nor canopy_id')
          )
        ) as CanopyId,
      }),
    })
  )

export const withOwner = <R extends OwnerColumns>(row: R): WithOwner<R> => ({
  ...row,
  owner: ownerOf(row),
})

export const withOwnerOrNull = <R extends OwnerColumns>(
  row: R | undefined
): WithOwner<R> | null =>
  pipe(Option.fromNullishOr(row), Option.map(withOwner), Option.getOrNull)

export const withUserOwner = <R extends OwnerColumns>(
  row: R
): R & { readonly owner: UserOwner } => ({
  ...row,
  owner: {
    _tag: 'User',
    userId: pipe(
      Option.fromNullishOr(row.userId),
      Option.getOrThrowWith(() => new Error('row has no user_id'))
    ),
  },
})

export const withCanopyOwner = <R extends OwnerColumns>(
  row: R
): R & { readonly owner: CanopyOwner } => ({
  ...row,
  owner: {
    _tag: 'Canopy',
    canopyId: pipe(
      Option.fromNullishOr(row.canopyId),
      Option.getOrThrowWith(() => new Error('row has no canopy_id'))
    ) as CanopyId,
  },
})

export const ownedBy = (
  table: { readonly userId: Column; readonly canopyId: Column },
  owner: PlantOwner
) =>
  owner._tag === 'User'
    ? eq(table.userId, owner.userId)
    : eq(table.canopyId, owner.canopyId)

export const ownerColumns = (
  owner: PlantOwner
): { readonly userId: string | null; readonly canopyId: string | null } =>
  owner._tag === 'User'
    ? { userId: owner.userId, canopyId: null }
    : { userId: null, canopyId: owner.canopyId }

export const sameOwner = (a: PlantOwner, b: PlantOwner): boolean =>
  a._tag === 'User'
    ? b._tag === 'User' && a.userId === b.userId
    : b._tag === 'Canopy' && a.canopyId === b.canopyId
