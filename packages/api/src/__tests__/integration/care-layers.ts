import { carePermit } from '@lily/api/__tests__/mocks/care'
import {
  Care,
  CareLive,
  careWhenOf,
  PlanStepChoice,
} from '@lily/api/contexts/care'
import { makeOutbox, Outbox } from '@lily/api/kernel/outbox'
import { type AppConsumersContext, appConsumers } from '@lily/api/layers/outbox'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect, Layer, Option } from 'effect'

export const ManualOutboxLive = Layer.effect(
  Outbox,
  Effect.gen(function* () {
    const context = yield* Effect.context<AppConsumersContext>()
    const { service } = yield* makeOutbox(appConsumers(context))
    return service
  })
)

export const CareOnPostgresLive = CareLive.pipe(
  Layer.provideMerge(ManualOutboxLive)
)

export const drainOutbox = Effect.flatMap(Outbox, (outbox) => outbox.drain)

const drainedOn =
  <ROut, LE, RIn>(outbox: Layer.Layer<ROut, LE, RIn>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.ensuring(Effect.orDie(drainOutbox)),
      Effect.provide(Layer.fresh(outbox))
    )

/**
 * Runs `effect` with Care and the outbox, then delivers what it appended.
 *
 * The layer is built fresh on every call. A ManagedRuntime shares built
 * layers across `Effect.provide` calls, and a shared outbox would keep the
 * repositories of the first caller instead of the ones a test swapped in.
 */
export const delivered = drainedOn(CareOnPostgresLive)

/** `delivered` for an effect that uses no Care command. */
export const settled = drainedOn(ManualOutboxLive)

export const waterAsCurrentUser = (plantId: string, date?: Date) =>
  Effect.gen(function* () {
    const { id } = yield* CurrentUser
    const care = yield* Care
    return yield* care.recordOne({
      permit: carePermit(plantId, id),
      careType: 'watering',
      on: careWhenOf(date),
      notes: Option.none(),
      photoUrl: Option.none(),
      planStep: PlanStepChoice.Auto(),
    })
  })
