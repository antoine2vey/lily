import type { Held } from '@lily/api/contexts/canopy/domain/canopy'
import {
  acting,
  type CanopyChanges,
  CanopyWrite,
  type Decided,
  Refusal,
} from '@lily/api/contexts/canopy/domain/vocabulary'
import { decision } from '@lily/api/kernel/transact'
import { type CanopyId, DEFAULT_ZONE, ZoneName } from '@lily/shared'
import { Array, type DateTime, Option, pipe, Result, Schema } from 'effect'

export const createCanopy = (
  held: Held,
  command: {
    readonly by: string
    readonly canopyId: CanopyId
    readonly name: string
    readonly now: DateTime.Utc
  }
): Decided<
  { readonly canopyId: CanopyId },
  'AlreadyInCanopy' | 'CreatorGone'
> =>
  Result.gen(function* () {
    if (Option.isSome(held.actorCanopy)) {
      return yield* Result.fail(
        Refusal.AlreadyInCanopy({ canopyName: held.actorCanopy.value.name })
      )
    }
    const creator = yield* Result.fromNullishOr(
      held.accounts.get(command.by),
      () => Refusal.CreatorGone()
    )
    return decision({ canopyId: command.canopyId }, [
      CanopyWrite.CreateCanopy({
        id: command.canopyId,
        name: command.name,
        timezone: creator.timezone ?? DEFAULT_ZONE,
        location: creator.location,
      }),
      CanopyWrite.AddMember({
        canopyId: command.canopyId,
        userId: command.by,
        role: 'owner',
        at: command.now,
      }),
    ])
  })

const actionsOf = (
  changes: CanopyChanges
): ReadonlyArray<'rename' | 'relocate'> => [
  ...(Option.isSome(changes.name) ? (['rename'] as const) : []),
  ...(Option.isSome(changes.timezone) ||
  Option.isSome(changes.latitude) ||
  Option.isSome(changes.longitude)
    ? (['relocate'] as const)
    : []),
]

export const updateCanopy = (
  held: Held,
  command: { readonly by: string; readonly changes: CanopyChanges }
): Decided<{ readonly canopyId: CanopyId }, 'NotMember' | 'NotOwner'> =>
  Result.map(
    acting(held, command.by, actionsOf(command.changes)),
    ({ canopy }) =>
      decision(
        { canopyId: canopy.id },
        Array.isReadonlyArrayNonEmpty(actionsOf(command.changes))
          ? [
              CanopyWrite.UpdateCanopy({
                canopyId: canopy.id,
                changes: command.changes,
              }),
            ]
          : [],
        Option.exists(
          command.changes.timezone,
          (timezone) => timezone !== canopy.timezone
        )
          ? [{ _tag: 'CanopyTimezoneChanged', canopyId: canopy.id }]
          : []
      )
  )

export const createLink = (
  held: Held,
  command: {
    readonly by: string
    readonly tokenHash: string
    readonly expiresAt: DateTime.Utc
    readonly now: DateTime.Utc
  }
): Decided<void, 'NotMember'> =>
  Result.map(acting(held, command.by, ['createLink']), ({ canopy }) =>
    decision(undefined, [
      CanopyWrite.ReplaceLink({
        canopyId: canopy.id,
        tokenHash: command.tokenHash,
        createdBy: command.by,
        expiresAt: command.expiresAt,
        at: command.now,
      }),
    ])
  )

export const revokeLink = (
  held: Held,
  command: { readonly by: string; readonly now: DateTime.Utc }
): Decided<void, 'NotMember'> =>
  Result.map(acting(held, command.by, ['revokeLink']), ({ canopy }) =>
    decision(undefined, [
      CanopyWrite.RevokeLinks({
        canopyId: canopy.id,
        onlyCreatedBy: Option.none(),
        at: command.now,
      }),
    ])
  )
