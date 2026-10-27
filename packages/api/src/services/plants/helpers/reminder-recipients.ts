import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { PlantOwner } from '@lily/shared'
import { Effect, Match, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface ReminderPlant {
  readonly id: string
  readonly owner: PlantOwner
}

export const reminderRecipients = (
  plant: ReminderPlant
): Effect.Effect<
  ReadonlyArray<string>,
  SqlError,
  DelegationRepository | CanopyRepository
> =>
  pipe(
    Match.value(plant.owner),
    Match.tag('User', ({ userId }) =>
      Effect.map(
        Effect.flatMap(DelegationRepository, (repo) =>
          repo.findActiveCaretakerForPlant(plant.id)
        ),
        (caretakerId) => [
          pipe(
            Option.fromNullishOr(caretakerId),
            Option.getOrElse(() => userId)
          ),
        ]
      )
    ),
    Match.tag('Canopy', ({ canopyId }) =>
      Effect.flatMap(CanopyRepository, (repo) =>
        repo.findReminderRecipients(canopyId, plant.id)
      )
    ),
    Match.exhaustive
  )
