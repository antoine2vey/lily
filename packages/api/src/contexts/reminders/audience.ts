import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { PlantOwner } from '@lily/shared'
import { Array, Effect, Filter, Match, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface AddressedPlant {
  readonly id: string
  readonly owner: PlantOwner
}

export const audiencesOf = <P extends AddressedPlant>(
  plants: ReadonlyArray<P>
): Effect.Effect<
  ReadonlyArray<readonly [P, ReadonlyArray<string>]>,
  SqlError,
  DelegationRepository | CanopyRepository
> =>
  Effect.gen(function* () {
    const caretakers = yield* Effect.flatMap(DelegationRepository, (repo) =>
      repo.findActiveCaretakersForPlants(
        Array.filterMap(
          plants,
          Filter.fromPredicateOption((plant: P) =>
            plant.owner._tag === 'User' ? Option.some(plant.id) : Option.none()
          )
        )
      )
    )
    return yield* Effect.forEach(plants, (plant) =>
      pipe(
        Match.value(plant.owner),
        Match.tag('User', ({ userId }) =>
          Effect.succeed([
            pipe(
              Array.findFirst(caretakers, (c) => c.plantId === plant.id),
              Option.map((c) => c.caretakerId),
              Option.getOrElse(() => userId)
            ),
          ])
        ),
        Match.tag('Canopy', ({ canopyId }) =>
          Effect.flatMap(CanopyRepository, (repo) =>
            repo.findReminderRecipients(canopyId, plant.id)
          )
        ),
        Match.exhaustive,
        Effect.map((audience) => [plant, audience] as const)
      )
    )
  })

export const audienceOf = (
  plant: AddressedPlant
): Effect.Effect<
  ReadonlyArray<string>,
  SqlError,
  DelegationRepository | CanopyRepository
> =>
  Effect.map(audiencesOf([plant]), (pairs) =>
    Array.flatMap(pairs, ([, audience]) => audience)
  )
