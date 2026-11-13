import {
  type Dirty,
  type ReplanContext,
  replan,
} from '@lily/api/contexts/reminders'
import { Outbox } from '@lily/api/kernel/outbox'
import { Effect, Layer } from 'effect'

const REMINDERS_TOPIC = 'reminders'

const remindersOnly =
  (requested: Dirty[]): Outbox['Service']['append'] =>
  (to, events) =>
    Effect.sync(() => {
      if (to.name === REMINDERS_TOPIC) {
        requested.push(...(events as ReadonlyArray<Dirty>))
      }
    })

/**
 * An outbox that keeps what was appended and delivers nothing. `requested`
 * holds the replan requests, in the order they were made.
 */
export const createMockOutbox = (requested: Dirty[] = []) => ({
  requested,
  layer: Layer.succeed(
    Outbox,
    Outbox.of({
      append: remindersOnly(requested),
      wake: Effect.void,
      drain: Effect.succeed(0),
      redrive: () => Effect.succeed(0),
    })
  ),
})

export const MockOutboxLive = createMockOutbox().layer

/**
 * A relay with no delay: a wake plans what was requested, against the
 * repositories in scope. For a test that asserts the reminders an action ends
 * with. The wake comes from `transact` after the commit, so a request made
 * in a transaction opened another way is never planned here.
 */
export const DeliveringOutboxLive = Layer.effect(
  Outbox,
  Effect.gen(function* () {
    const context = yield* Effect.context<ReplanContext>()
    const requested: Dirty[] = []
    const deliver = Effect.suspend(() =>
      Effect.forEach(requested.splice(0), replan)
    ).pipe(Effect.provide(context), Effect.orDie)
    return Outbox.of({
      append: remindersOnly(requested),
      wake: Effect.asVoid(deliver),
      drain: Effect.map(deliver, (planned) => planned.length),
      redrive: () => Effect.succeed(0),
    })
  })
)
