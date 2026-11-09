import {
  audienceByPlant,
  lockOf,
} from '@lily/api/repositories/helpers/recipient'
import { RecipientRepository } from '@lily/api/repositories/recipient.repository'
import type { DelegationStatus, UserStatus } from '@lily/shared'
import { Array, Effect, Layer, Option, Order, pipe } from 'effect'

export interface RecipientWorld {
  readonly plants: ReadonlyArray<{
    readonly id: string
    readonly userId: string | null
    readonly canopyId: string | null
  }>
  readonly members?:
    | ReadonlyArray<{
        readonly userId: string
        readonly canopyId: string
        readonly joinedAt: Date
      }>
    | undefined
  readonly mutes?:
    | ReadonlyArray<{
        readonly userId: string
        readonly plantId: string
      }>
    | undefined
  readonly delegations?:
    | ReadonlyArray<{
        readonly id: string
        readonly caretakerId: string
        readonly status: DelegationStatus
      }>
    | undefined
  readonly delegationPlants?:
    | ReadonlyArray<{
        readonly delegationId: string
        readonly plantId: string
      }>
    | undefined
  readonly users?:
    | ReadonlyArray<{
        readonly id: string
        readonly status: UserStatus
      }>
    | undefined
}

const reachable = (world: RecipientWorld, userId: string) =>
  Option.match(
    Array.findFirst(world.users ?? [], (u) => u.id === userId),
    {
      onNone: () => true,
      onSome: (user) => Option.isNone(lockOf(user)),
    }
  )

type Member = NonNullable<RecipientWorld['members']>[number]

const byJoinThenId = Order.combine(
  Order.mapInput(Order.Date, (m: Member) => m.joinedAt),
  Order.mapInput(Order.String, (m: Member) => m.userId)
)

const personalAudience = (
  world: RecipientWorld,
  plantId: string,
  ownerId: string
): ReadonlyArray<string> => {
  const caretakers = pipe(
    world.delegationPlants ?? [],
    Array.filter((link) => link.plantId === plantId),
    Array.flatMap((link) =>
      Array.filter(
        world.delegations ?? [],
        (d) => d.id === link.delegationId && d.status === 'active'
      )
    ),
    Array.map((d) => d.caretakerId),
    Array.filter((id) => reachable(world, id)),
    Array.sort(Order.String)
  )
  if (Array.isReadonlyArrayNonEmpty(caretakers)) return caretakers
  return reachable(world, ownerId) ? [ownerId] : []
}

const canopyAudience = (
  world: RecipientWorld,
  plantId: string,
  canopyId: string
): ReadonlyArray<string> =>
  pipe(
    world.members ?? [],
    Array.filter(
      (m) =>
        m.canopyId === canopyId &&
        reachable(world, m.userId) &&
        !Array.some(
          world.mutes ?? [],
          (mute) => mute.userId === m.userId && mute.plantId === plantId
        )
    ),
    Array.sort(byJoinThenId),
    Array.map((m) => m.userId)
  )

export const audienceIn = (
  world: RecipientWorld,
  plantId: string
): ReadonlyArray<string> =>
  pipe(
    Array.findFirst(world.plants, (p) => p.id === plantId),
    Option.match({
      onNone: () => [],
      onSome: (plant) =>
        plant.canopyId !== null
          ? canopyAudience(world, plant.id, plant.canopyId)
          : plant.userId !== null
            ? personalAudience(world, plant.id, plant.userId)
            : [],
    })
  )

export const createMockRecipientRepository = (
  world: RecipientWorld = { plants: [] }
): Layer.Layer<RecipientRepository> =>
  Layer.succeed(RecipientRepository, {
    audienceOf: (plantIds) =>
      Effect.sync(() =>
        audienceByPlant(
          plantIds,
          Array.flatMap(plantIds, (plantId) =>
            Array.map(audienceIn(world, plantId), (recipientId) => ({
              plantId,
              recipientId,
            }))
          )
        )
      ),
  })
