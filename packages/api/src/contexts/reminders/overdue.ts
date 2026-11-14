import { CareReads, DueScope, DueWindow } from '@lily/api/contexts/care'
import {
  type CapOf,
  capAudience,
  OverdueDecision,
  type OverdueSkip,
  planOverdueDigest,
} from '@lily/api/contexts/reminders/domain/overdue'
import {
  apply,
  loadDigest,
  type StoreContext,
} from '@lily/api/contexts/reminders/store'
import { transactQuietly } from '@lily/api/kernel/transact'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { PlantOwner } from '@lily/shared'
import { Array, Effect, Option, pipe, Random, Record } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/** Billing's answer to how many plants of each owner may be reminded about. */
export type PlantCaps<R> = (
  owners: ReadonlyArray<PlantOwner>
) => Effect.Effect<CapOf, SqlError, R>

export interface OverdueOutcome {
  readonly recipientId: string
  /** Rows written. Zero when skipped. */
  readonly reminded: number
  readonly skipped: Option.Option<OverdueSkip | 'write-failed'>
}

export interface OverduePass {
  readonly outcomes: ReadonlyArray<OverdueOutcome>
  /** Audience members with plants their owner's cap left out, and how many. */
  readonly overflow: ReadonlyArray<{
    readonly userId: string
    readonly plants: number
  }>
}

export type OverdueContext = StoreContext | CareScheduleRepository

const remindRecipient = (
  recipientId: string,
  plantIds: ReadonlyArray<string>
): Effect.Effect<OverdueOutcome, never, StoreContext> =>
  Effect.gen(function* () {
    const roll = yield* Random.nextBetween(0, 0.5)
    const decision = yield* transactQuietly(
      Effect.gen(function* () {
        const decided = Option.match(
          yield* loadDigest(recipientId, plantIds, roll),
          {
            onNone: () => OverdueDecision.Skipped({ why: 'unreachable' }),
            onSome: planOverdueDigest,
          }
        )
        if (decided._tag === 'Planned') yield* apply(decided.changes)
        return decided
      })
    )
    return OverdueDecision.$match(decision, {
      Planned: ({ changes }): OverdueOutcome => ({
        recipientId,
        reminded: changes.length,
        skipped: Option.none(),
      }),
      Skipped: ({ why }): OverdueOutcome => ({
        recipientId,
        reminded: 0,
        skipped: Option.some(why),
      }),
    })
  }).pipe(
    Effect.catchTag('SqlError', (error) =>
      Effect.logWarning('[reminders] Overdue digest failed', {
        userId: recipientId,
        error: String(error),
      }).pipe(
        Effect.as<OverdueOutcome>({
          recipientId,
          reminded: 0,
          skipped: Option.some('write-failed'),
        })
      )
    ),
    Effect.withSpan('Reminders.remindOverdueRecipient', {
      attributes: { 'user.id': recipientId },
    })
  )

/**
 * The overdue pass. A scan without locks finds the living plants with an
 * overdue care and reminders on, who each one addresses, and which of them
 * the owner's cap keeps. Each recipient is then decided in a transaction of
 * their own, so one failure costs one recipient.
 */
export const remindOverdue = <R>(
  capsFor: PlantCaps<R>
): Effect.Effect<OverduePass, SqlError, OverdueContext | R> =>
  Effect.gen(function* () {
    const careReads = yield* CareReads
    const scheduleRepo = yield* CareScheduleRepository
    const overdue = yield* careReads.due({
      scope: DueScope.Everyone(),
      upTo: DueWindow.Overdue(),
    })
    const audience = yield* scheduleRepo.findReminderAudience(
      pipe(
        overdue,
        Array.filter((care) => care.plant.remindersEnabled),
        Array.map((care) => care.plant.id),
        Array.dedupe
      )
    )
    if (Record.isEmptyRecord(audience)) return { outcomes: [], overflow: [] }

    const capOf = yield* capsFor(
      pipe(
        Record.values(audience),
        Array.flatten,
        Array.map((plant) => plant.owner)
      )
    )
    const capped = Record.map(audience, (plants) => capAudience(plants, capOf))
    const byRecipient = pipe(
      Record.values(capped),
      Array.flatMap(({ eligible }) => eligible),
      Array.groupBy((plant) => plant.recipientId)
    )
    const outcomes = yield* Effect.forEach(
      Record.toEntries(byRecipient),
      ([recipientId, plants]) =>
        remindRecipient(
          recipientId,
          Array.map(plants, (plant) => plant.id)
        ),
      { concurrency: 10 }
    )
    return {
      outcomes,
      overflow: pipe(
        Record.toEntries(capped),
        Array.filter(([, { overflow }]) => overflow > 0),
        Array.map(([userId, { overflow }]) => ({ userId, plants: overflow }))
      ),
    }
  }).pipe(Effect.withSpan('Reminders.remindOverdue'))
