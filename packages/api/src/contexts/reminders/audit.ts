import { CareReads, DueScope, DueWindow } from '@lily/api/contexts/care'
import {
  CANOPY_CONSUMER,
  CARE_CONSUMER,
  REPLAN_CONSUMER,
} from '@lily/api/contexts/reminders/consumers'
import {
  type ReplanContext,
  replanPlants,
} from '@lily/api/contexts/reminders/replan'
import { Outbox } from '@lily/api/kernel/outbox'
import { Array, Duration, Effect, Number, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

const REDRIVE_WINDOW = Duration.hours(24)

const DRIFT_WINDOW_DAYS = 2

/**
 * Gives the events and requests Reminders dead-lettered within the last day
 * another round of attempts. Returns how many.
 */
export const redriveReminders: Effect.Effect<number, SqlError, Outbox> =
  Effect.flatMap(Outbox, (outbox) =>
    Effect.forEach([CARE_CONSUMER, CANOPY_CONSUMER, REPLAN_CONSUMER], (name) =>
      outbox.redrive(name, REDRIVE_WINDOW)
    )
  ).pipe(Effect.map(Number.sumAll), Effect.withSpan('Reminders.redrive'))

export interface DriftReport {
  /** Living plants with a care overdue, due today or due within two care days. */
  readonly plants: number
  /**
   * Changes the replan had to make. 0 is the healthy value: more means a
   * writer changed something reminders are planned from and did not say so.
   */
  readonly drift: number
}

/** Replans every plant whose reminders matter soon, and reports what it had to change. */
export const repairDrift: Effect.Effect<DriftReport, SqlError, ReplanContext> =
  Effect.gen(function* () {
    const careReads = yield* CareReads
    const plantIds = pipe(
      yield* careReads.due({
        scope: DueScope.Everyone(),
        upTo: DueWindow.Ahead({ days: DRIFT_WINDOW_DAYS }),
      }),
      Array.map((care) => care.plant.id),
      Array.dedupe
    )
    return { plants: plantIds.length, drift: yield* replanPlants(plantIds) }
  }).pipe(Effect.withSpan('Reminders.repairDrift'))
