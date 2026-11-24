import { type AppEvent, EventBus, InMemoryEventBusLive } from '@lily/api/events'
import { createSubscriber } from '@lily/api/services/helpers/create-subscriber'
import {
  Data,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Logger,
  References,
  Scope,
} from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

class HandlerRefused extends Data.TaggedError('HandlerRefused')<{
  readonly message: string
}> {}

const first: AppEvent = {
  _tag: 'PlantCreated',
  userId: 'user-1',
  plantId: 'plant-1',
}

const second: AppEvent = {
  _tag: 'PlantLifecycleChanged',
  userId: 'user-1',
  plantId: 'plant-1',
}

interface Logged {
  readonly level: string
  readonly message: unknown
}

/**
 * Publishes `first`, whose handling ends in `firstEvent`, then `second`.
 * Returns the tags of the events handled to the end
 * and what the subscriber logged at error level.
 */
const afterFirstEvent = (firstEvent: Effect.Effect<never, HandlerRefused>) => {
  const logs: Logged[] = []
  const capture = Logger.make<unknown, void>(({ logLevel, message }) => {
    if (logLevel === 'Error') logs.push({ level: logLevel, message })
  })

  return Effect.gen(function* () {
    const handled: string[] = []
    const secondHandled = yield* Deferred.make<void>()

    yield* createSubscriber({
      name: 'test-subscriber',
      handle: (event) =>
        event._tag === first._tag
          ? firstEvent
          : Effect.sync(() => handled.push(event._tag)).pipe(
              Effect.andThen(Deferred.succeed(secondHandled, undefined))
            ),
    })
    const bus = yield* EventBus
    yield* bus.publish(first)
    yield* bus.publish(second)
    yield* Deferred.await(secondHandled).pipe(Effect.timeoutOption('1 second'))

    return { handled, logs }
  }).pipe(
    Effect.scoped,
    Effect.provide(Layer.merge(InMemoryEventBusLive, Logger.layer([capture]))),
    Effect.runPromise
  )
}

describe('createSubscriber', () => {
  it('handles the next event after one fails with a typed error', async () => {
    const { handled, logs } = await afterFirstEvent(
      Effect.fail(new HandlerRefused({ message: 'push config missing' }))
    )

    expect(handled).toEqual(['PlantLifecycleChanged'])
    expect(logs).toEqual([
      {
        level: 'Error',
        message: [
          '[test-subscriber] Unhandled error handling event',
          {
            event: 'PlantCreated',
            cause: expect.stringContaining('push config missing'),
          },
        ],
      },
    ])
  })

  it('handles the next event after one dies', async () => {
    const { handled, logs } = await afterFirstEvent(
      Effect.die(new Error('handler exploded'))
    )

    expect(handled).toEqual(['PlantLifecycleChanged'])
    expect(logs).toEqual([
      {
        level: 'Error',
        message: [
          '[test-subscriber] Unhandled error handling event',
          {
            event: 'PlantCreated',
            cause: expect.stringContaining('handler exploded'),
          },
        ],
      },
    ])
  })

  it('lets the event in flight finish on shutdown, then takes no other', async () => {
    const timeline = await Effect.gen(function* () {
      const timeline: string[] = []
      const started = yield* Deferred.make<void>()
      const scope = yield* Scope.make()
      const bus = yield* EventBus

      yield* Layer.buildWithScope(
        Layer.effectDiscard(
          createSubscriber({
            name: 'test-subscriber',
            handle: (event) =>
              Effect.sync(() => timeline.push(`start ${event._tag}`)).pipe(
                Effect.andThen(Deferred.succeed(started, undefined)),
                Effect.andThen(Effect.sleep('5 seconds')),
                Effect.andThen(
                  Effect.sync(() => timeline.push(`end ${event._tag}`))
                )
              ),
          })
        ),
        scope
      )
      yield* bus.publish(first)
      yield* bus.publish(second)
      yield* Deferred.await(started)

      const closing = yield* Effect.forkChild(
        Scope.close(scope, Exit.void).pipe(
          Effect.andThen(Effect.sync(() => timeline.push('shutdown')))
        )
      )
      yield* TestClock.adjust('1 minute')
      yield* Fiber.join(closing)
      return timeline
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(InMemoryEventBusLive, TestClock.layer())),
      Effect.provideService(References.MinimumLogLevel, 'None'),
      Effect.runPromise
    )

    expect(timeline).toEqual([
      'start PlantCreated',
      'end PlantCreated',
      'shutdown',
    ])
  })
})
