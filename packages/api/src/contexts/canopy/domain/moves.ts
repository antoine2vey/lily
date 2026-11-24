import {
  type CanopyState,
  type Held,
  type HeldPlant,
  memberOf,
  takesASlot,
} from '@lily/api/contexts/canopy/domain/canopy'
import type { CanopyEvent } from '@lily/api/contexts/canopy/domain/events'
import {
  acting,
  CanopyWrite,
  type Decided,
  type Decision,
  may,
  type Placement,
  Refusal,
  type RefusalOf,
  type RoomMove,
  seatOf,
} from '@lily/api/contexts/canopy/domain/vocabulary'
import { decision } from '@lily/api/kernel/transact'
import type { LimitExceededError, PlantOwner } from '@lily/shared'
import { Array, Equal, Match, Option, pipe, Result } from 'effect'

export interface MoveFacts {
  readonly inOpenDelegation: boolean
  readonly overLimit: Option.Option<LimitExceededError>
}

const roomOf = (
  held: Held,
  room: Placement,
  receiver: PlantOwner
): Result.Result<Placement, RefusalOf<'RoomNotFound'>> =>
  Match.value(room).pipe(
    Match.tagsExhaustive({
      Clear: () => Result.succeed(room),
      Put: ({ roomId }) =>
        Array.some(
          held.rooms,
          (candidate) =>
            candidate.id === roomId && Equal.equals(candidate.owner, receiver)
        )
          ? Result.succeed(room)
          : Result.fail(Refusal.RoomNotFound({ roomId })),
    })
  )

const underLimit = (
  plant: HeldPlant,
  facts: Pick<MoveFacts, 'overLimit'>
): Result.Result<void, RefusalOf<'OverLimit'>> =>
  Option.match(
    Option.filter(facts.overLimit, () => takesASlot(plant)),
    {
      onNone: () => Result.void,
      onSome: (error) => Result.fail(Refusal.OverLimit({ error })),
    }
  )

export interface Changes {
  readonly writes: ReadonlyArray<CanopyWrite>
  readonly events: ReadonlyArray<CanopyEvent>
}

export const moving = (
  plants: ReadonlyArray<HeldPlant>,
  from: PlantOwner,
  to: PlantOwner,
  room: RoomMove
): Changes =>
  Array.match(
    Array.map(plants, (plant) => plant.id),
    {
      onEmpty: () => ({ writes: [], events: [] }),
      onNonEmpty: (plantIds) => ({
        writes: [CanopyWrite.MovePlants({ plantIds, from, to, room })],
        events: [{ _tag: 'PlantsMoved', plantIds, from, to }],
      }),
    }
  )

const moved = (
  plant: HeldPlant,
  to: PlantOwner,
  room: Placement
): Decision<void> => {
  const { writes, events } = moving([plant], plant.owner, to, room)
  return decision(undefined, writes, events)
}

export const sharePlant = (
  held: Held,
  command: {
    readonly by: string
    readonly plantId: string
    readonly room: Placement
    readonly facts: MoveFacts
  }
): Decided<
  void,
  'NotMember' | 'PlantInDelegation' | 'PlantGone' | 'RoomNotFound' | 'OverLimit'
> =>
  Result.gen(function* () {
    const { by, plantId, facts } = command
    const { canopy } = yield* acting(held, by, ['share'])
    if (facts.inOpenDelegation) {
      return yield* Result.fail(Refusal.PlantInDelegation({ plantId }))
    }
    const plant = yield* Result.fromOption(
      Array.findFirst(
        held.plants,
        (candidate) =>
          candidate.id === plantId &&
          Equal.equals(candidate.owner, { _tag: 'User', userId: by })
      ),
      () => Refusal.PlantGone({ plantId })
    )
    const to: PlantOwner = { _tag: 'Canopy', canopyId: canopy.id }
    const room = yield* roomOf(held, command.room, to)
    yield* underLimit(plant, facts)
    return moved(plant, to, room)
  })

const sharedIn = (
  held: Held,
  canopy: CanopyState,
  plantId: string
): Result.Result<HeldPlant, RefusalOf<'NotMember' | 'PlantGone'>> =>
  Result.flatMap(
    Result.fromOption(
      Array.findFirst(held.plants, (candidate) => candidate.id === plantId),
      (): RefusalOf<'NotMember' | 'PlantGone'> => Refusal.PlantGone({ plantId })
    ),
    (plant) =>
      Match.value(plant.owner).pipe(
        Match.tagsExhaustive({
          User: () => Result.fail(Refusal.PlantGone({ plantId })),
          Canopy: ({ canopyId }) =>
            canopyId === canopy.id
              ? Result.succeed(plant)
              : Result.fail(Refusal.NotMember()),
        })
      )
  )

const unshareOf = (
  canopy: CanopyState,
  plant: HeldPlant,
  by: string
): 'unshareOwn' | 'unshareOfMember' | 'unshareOfDeparted' => {
  if (Option.exists(plant.sharer, (sharer) => sharer === by)) {
    return 'unshareOwn'
  }
  return Option.exists(plant.sharer, (sharer) =>
    Option.isSome(memberOf(canopy, sharer))
  )
    ? 'unshareOfMember'
    : 'unshareOfDeparted'
}

export const unsharePlant = (
  held: Held,
  command: {
    readonly by: string
    readonly plantId: string
    readonly room: Placement
    readonly facts: Pick<MoveFacts, 'overLimit'>
  }
): Decided<
  void,
  'NotMember' | 'PlantGone' | 'PlantNotYours' | 'RoomNotFound' | 'OverLimit'
> =>
  Result.gen(function* () {
    const { by, plantId, facts } = command
    const { canopy, member } = yield* seatOf(held, by)
    const plant = yield* sharedIn(held, canopy, plantId)
    if (!may(member, unshareOf(canopy, plant, by))) {
      return yield* Result.fail(Refusal.PlantNotYours())
    }
    const to: PlantOwner = { _tag: 'User', userId: by }
    const room = yield* roomOf(held, command.room, to)
    yield* underLimit(plant, facts)
    return moved(plant, to, room)
  })

export const setMute = (
  held: Held,
  command: {
    readonly by: string
    readonly plantId: string
    readonly muted: boolean
  }
): Decided<void, 'PlantGone'> => {
  const { by, plantId } = command
  const gone = () => Refusal.PlantGone({ plantId })
  return pipe(
    acting(held, by, ['mute']),
    Result.mapError(gone),
    Result.flatMap(({ canopy }) =>
      Result.mapError(sharedIn(held, canopy, plantId), gone)
    ),
    Result.map((plant) => {
      const mute = { userId: by, plantId: plant.id }
      return command.muted
        ? decision(
            undefined,
            [CanopyWrite.Mute(mute)],
            [{ _tag: 'PlantMuted', ...mute }]
          )
        : decision(
            undefined,
            [CanopyWrite.Unmute(mute)],
            [{ _tag: 'PlantUnmuted', ...mute }]
          )
    })
  )
}
