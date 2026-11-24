import {
  type Account,
  type CanopyState,
  type Held,
  type HeldPlant,
  memberOf,
  successorOf,
} from '@lily/api/contexts/canopy/domain/canopy'
import type { MemberLeftReason } from '@lily/api/contexts/canopy/domain/events'
import { type Changes, moving } from '@lily/api/contexts/canopy/domain/moves'
import {
  acting,
  CanopyWrite,
  type Decided,
  type Decision,
  Notice,
  Refusal,
  RoomMove,
  seatOf,
} from '@lily/api/contexts/canopy/domain/vocabulary'
import { decision } from '@lily/api/kernel/transact'
import type { CanopyId, PlantOwner } from '@lily/shared'
import { Array, type DateTime, Option, pipe, Result } from 'effect'

const ofUser = (userId: string): PlantOwner => ({ _tag: 'User', userId })

const ofCanopy = (canopy: CanopyState): PlantOwner => ({
  _tag: 'Canopy',
  canopyId: canopy.id,
})

const sharedBy = (held: Held, userId: string): ReadonlyArray<HeldPlant> =>
  Array.filter(held.plants, (plant) =>
    Option.exists(plant.sharer, (sharer) => sharer === userId)
  )

export type SharedPlants = 'return' | 'stay'

const LEAVING_WITH: Record<
  SharedPlants,
  (held: Held, leaver: string) => ReadonlyArray<HeldPlant>
> = {
  return: sharedBy,
  stay: () => [],
}

const accountOf = (held: Held, userId: string): Option.Option<Account> =>
  Option.fromNullishOr(held.accounts.get(userId))

const departure = (
  held: Held,
  canopy: CanopyState,
  leaver: string,
  plants: SharedPlants,
  now: DateTime.Utc
): Changes => {
  const returned = moving(
    LEAVING_WITH[plants](held, leaver),
    ofCanopy(canopy),
    ofUser(leaver),
    RoomMove.Clear()
  )
  return {
    writes: [
      ...returned.writes,
      CanopyWrite.RemoveMember({ canopyId: canopy.id, userId: leaver }),
      CanopyWrite.WithdrawInvitationsSentByOrTo({
        canopyId: canopy.id,
        userId: leaver,
        at: now,
      }),
    ],
    events: returned.events,
  }
}

const dissolution = (
  held: Held,
  canopy: CanopyState,
  heir: string
): Changes => {
  const from = ofCanopy(canopy)
  const sharers = pipe(
    canopy.members,
    Array.map((member) => member.userId),
    Array.filter((userId) => userId !== heir)
  )
  const returned = Array.map(sharers, (sharer) =>
    moving(sharedBy(held, sharer), from, ofUser(sharer), RoomMove.Clear())
  )
  const inherited = moving(
    Array.filter(
      held.plants,
      (plant) =>
        !Option.exists(plant.sharer, (sharer) =>
          Array.contains(sharers, sharer)
        )
    ),
    from,
    ofUser(heir),
    RoomMove.Keep()
  )
  return {
    writes: [
      ...Array.flatMap(returned, (move) => move.writes),
      ...Array.match(
        Array.map(held.rooms, (room) => room.id),
        {
          onEmpty: () => [],
          onNonEmpty: (roomIds) => [
            CanopyWrite.MoveRooms({
              roomIds,
              canopyId: canopy.id,
              toUserId: heir,
            }),
          ],
        }
      ),
      ...inherited.writes,
      CanopyWrite.DeleteCanopy({ canopyId: canopy.id }),
    ],
    events: [
      ...Array.flatMap(returned, (move) => move.events),
      ...inherited.events,
      { _tag: 'CanopyDissolved', canopyId: canopy.id },
    ],
  }
}

export type LeaveOutcome = 'left' | 'dissolved'

export const leave = (
  held: Held,
  command: {
    readonly by: string
    readonly plants: SharedPlants
    readonly reason: Exclude<MemberLeftReason, 'removed'>
    readonly now: DateTime.Utc
  }
): Decided<LeaveOutcome, 'NotMember'> =>
  Result.map(seatOf(held, command.by), ({ canopy }) => {
    const { by, now } = command
    return Option.match(successorOf(canopy, by), {
      onNone: (): Decision<LeaveOutcome> => {
        const { writes, events } = dissolution(held, canopy, by)
        return decision('dissolved', writes, events)
      },
      onSome: (successor): Decision<LeaveOutcome> => {
        const gone = departure(held, canopy, by, command.plants, now)
        return decision(
          'left',
          [
            ...gone.writes,
            CanopyWrite.RevokeLinks({
              canopyId: canopy.id,
              onlyCreatedBy: Option.some(by),
              at: now,
            }),
            ...(successor.role === 'owner'
              ? []
              : [
                  CanopyWrite.SetOwner({
                    canopyId: canopy.id,
                    userId: successor.userId,
                  }),
                ]),
          ],
          [
            ...gone.events,
            {
              _tag: 'MemberLeft',
              canopyId: canopy.id,
              userId: by,
              reason: command.reason,
            },
          ],
          Array.map(Option.toArray(accountOf(held, successor.userId)), (to) =>
            Notice.MemberLeft({
              to,
              leaverName: pipe(
                accountOf(held, by),
                Option.flatMapNullishOr((account) => account.name),
                Option.getOrNull
              ),
              canopyName: canopy.name,
            })
          )
        )
      },
    })
  })

export const removeMember = (
  held: Held,
  command: {
    readonly by: string
    readonly target: string
    readonly now: DateTime.Utc
  }
): Decided<
  { readonly canopyId: CanopyId },
  'NotMember' | 'NotOwner' | 'MemberNotFound'
> =>
  Result.gen(function* () {
    const { by, target, now } = command
    const { canopy } = yield* acting(held, by, ['removeMember'])
    const removed = yield* Result.fromOption(
      Option.filter(memberOf(canopy, target), (member) => member.userId !== by),
      () => Refusal.MemberNotFound()
    )
    const gone = departure(held, canopy, removed.userId, 'return', now)
    return decision(
      { canopyId: canopy.id },
      [
        ...gone.writes,
        CanopyWrite.RevokeLinks({
          canopyId: canopy.id,
          onlyCreatedBy: Option.none(),
          at: now,
        }),
      ],
      [
        ...gone.events,
        {
          _tag: 'MemberLeft',
          canopyId: canopy.id,
          userId: removed.userId,
          reason: 'removed',
        },
      ],
      Array.map(Option.toArray(accountOf(held, removed.userId)), (to) =>
        Notice.MemberRemoved({ to, canopyName: canopy.name })
      )
    )
  })

export const dissolve = (
  held: Held,
  command: { readonly by: string }
): Decided<void, 'NotMember' | 'NotOwner'> =>
  Result.map(acting(held, command.by, ['dissolve']), ({ canopy }) => {
    const { writes, events } = dissolution(held, canopy, command.by)
    return decision(undefined, writes, events)
  })
