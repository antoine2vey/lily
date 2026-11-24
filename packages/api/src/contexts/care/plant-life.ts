import { careCommands } from '@lily/api/contexts/care/commands'
import type {
  Frequency,
  PlantDraft,
} from '@lily/api/contexts/care/domain/care-plant'
import {
  bury,
  type OwnerRoom,
  plantNew,
  remove,
  revive,
  usersNamedBy,
} from '@lily/api/contexts/care/domain/life'
import { CareStore } from '@lily/api/contexts/care/store'
import type { OwnerHeld } from '@lily/api/kernel/owner'
import {
  actingUserId,
  type PlantAction,
  type PlantPermit,
} from '@lily/api/kernel/permit'
import {
  CARE_TYPES,
  CareDays,
  type CareType,
  type LimitExceededError,
  type PlantOwner,
} from '@lily/shared'
import type {
  PlantAlreadyDeadError,
  PlantNotDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import type { UnauthorizedError } from '@lily/shared/errors/user'
import type { PlantDeathCause } from '@lily/shared/plant'
import { Context, DateTime, Effect, Layer, Option } from 'effect'

/**
 * The one way a plant comes to exist, dies, comes back or goes. Each command
 * writes in a single transaction and publishes `PlantLifeChanged` in it.
 */
export class PlantLife extends Context.Service<
  PlantLife,
  {
    /**
     * Writes the plant and its schedules, or neither. Each schedule starts
     * today in the owner's care timezone. `held` is the caller's proof that
     * it checked the owner's plant limit under the owner lock. A creator
     * whose account is gone answers as a request with no account behind it.
     */
    readonly plant: (command: {
      readonly held: OwnerHeld
      readonly by: string
      readonly draft: PlantDraft
      readonly frequencies: ReadonlyArray<
        readonly [CareType, Option.Option<Frequency>]
      >
    }) => Effect.Effect<{ readonly plantId: string }, UnauthorizedError>
    /**
     * Moves the plant to the cemetery. Its schedules, cares, photos and
     * plans stay. A plant that left `seenOwner` since the access check
     * answers as a plant that does not exist.
     */
    readonly bury: (command: {
      readonly permit: PlantPermit<'markDead'>
      readonly seenOwner: PlantOwner
      readonly cause: PlantDeathCause
      readonly note: Option.Option<string>
    }) => Effect.Effect<void, PlantNotFoundError | PlantAlreadyDeadError>
    /**
     * Brings the plant back and restarts every due day at today plus the
     * schedule's frequency, in the plant's care timezone. `room` is what the
     * owner's plant limit answered under `held`. A living plant is refused
     * before a full owner is.
     */
    readonly revive: (command: {
      readonly permit: PlantPermit<'revive'>
      readonly held: OwnerHeld
      readonly room: OwnerRoom
    }) => Effect.Effect<
      void,
      PlantNotFoundError | PlantNotDeadError | LimitExceededError
    >
    /** Deletes the plant, living or dead, and every row that hangs on it. */
    readonly remove: (command: {
      readonly permit: PlantPermit<'delete'>
      readonly seenOwner: PlantOwner
    }) => Effect.Effect<void, PlantNotFoundError>
  }
>()('care/PlantLife') {}

export const PlantLifeLive = Layer.effect(
  PlantLife,
  Effect.gen(function* () {
    const store = yield* CareStore
    const { run, onPlant } = yield* careCommands

    const actorOf = (permit: PlantPermit<PlantAction>) =>
      Option.fromNullishOr(actingUserId(permit))

    return PlantLife.of({
      plant: ({ held, by, draft, frequencies }) =>
        Effect.flatMap(DateTime.now, (now) =>
          run(
            'care.plant',
            store.lockAndLoadForPlanting(
              usersNamedBy({ owner: held.owner, by }),
              held.owner
            ),
            ({ timezone, accountsHeld }) =>
              plantNew(
                {
                  plantId: crypto.randomUUID(),
                  owner: held.owner,
                  by,
                  draft,
                  frequencies,
                  timezone,
                  today: CareDays.today(timezone, now),
                },
                accountsHeld
              )
          )
        ),
      bury: ({ permit, seenOwner, cause, note }) =>
        Effect.flatMap(DateTime.now, (at) =>
          onPlant('care.bury', permit.plantId, [], (plant) =>
            bury(plant, permit.plantId, {
              seenOwner,
              by: actorOf(permit),
              at,
              cause,
              note,
            })
          )
        ),
      revive: ({ permit, held, room }) =>
        onPlant('care.revive', permit.plantId, CARE_TYPES, (plant) =>
          revive(plant, permit.plantId, { held, by: actorOf(permit), room })
        ),
      // The delete needs the strongest row lock. Taking it at the load keeps
      // it from upgrading a weaker one while another transaction holds a key
      // share on the row, which is a deadlock.
      remove: ({ permit, seenOwner }) =>
        onPlant(
          'care.remove',
          permit.plantId,
          [],
          (plant) =>
            remove(plant, permit.plantId, { seenOwner, by: actorOf(permit) }),
          'update'
        ),
    })
  })
)
