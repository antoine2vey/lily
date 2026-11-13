import { onlyFor, planPlant } from '@lily/api/contexts/reminders/domain/plan'
import {
  apply,
  Dirty,
  load,
  plantsOf,
  type StoreContext,
} from '@lily/api/contexts/reminders/store'
import { Array, Effect, Number, Option } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export type ReplanContext = StoreContext

const PLANTS_PER_TRANSACTION = 50

const replanChunk = (
  plantIds: ReadonlyArray<string>,
  onlyUser: Option.Option<string>
): Effect.Effect<number, SqlError, ReplanContext> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql.withTransaction(
      Effect.gen(function* () {
        const { plants, recipients, now } = yield* load(plantIds)
        const changes = Array.flatMap(plants, (plant) =>
          onlyFor(
            planPlant(plant, recipients, now),
            plant.shared ? onlyUser : Option.none()
          )
        )
        yield* apply(changes)
        return changes.length
      })
    )
  )

/**
 * Makes the stored reminders of these plants match the rule and returns how
 * many changes that took. The plan covers every recipient. On a Canopy plant
 * `onlyUser` narrows what is written to one member's rows, so one member's
 * change cannot re-time another member's reminder. A personal plant is always
 * written whole: its one reminder follows whoever tends it, and writing half
 * of a hand-over would lose the reminder.
 *
 * Idempotent: a second run changes nothing and returns 0. Each chunk of
 * plants is loaded, planned and written in a transaction of its own.
 */
export const replanPlants = (
  plantIds: ReadonlyArray<string>,
  onlyUser: Option.Option<string> = Option.none()
): Effect.Effect<number, SqlError, ReplanContext> => {
  const ids = Array.dedupe(plantIds)
  return Effect.forEach(Array.chunksOf(ids, PLANTS_PER_TRANSACTION), (chunk) =>
    replanChunk(chunk, onlyUser)
  ).pipe(
    Effect.map(Number.sumAll),
    Effect.withSpan('Reminders.replan', {
      attributes: { 'plants.count': ids.length },
    })
  )
}

/** Makes the stored reminders of everything `dirty` names match the rule. */
export const replan = (
  dirty: Dirty
): Effect.Effect<number, SqlError, ReplanContext> =>
  Effect.flatMap(plantsOf(dirty), (plantIds) =>
    replanPlants(
      plantIds,
      Dirty.$match(dirty, {
        Plants: () => Option.none(),
        Canopy: () => Option.none(),
        Recipient: ({ userId }) => Option.some(userId),
      })
    )
  )
