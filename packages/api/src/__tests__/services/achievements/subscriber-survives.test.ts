import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { EventBus, InMemoryEventBusLive } from '@lily/api/events'
import { startAchievementSubscriber } from '@lily/api/services/achievements/checker'
import { AchievementNotifier } from '@lily/api/services/achievements/notifier'
import { Deferred, Effect, Layer, Option, References } from 'effect'
import { describe, expect, it } from 'vitest'

describe('achievement subscriber', () => {
  it('handles the next event after one event dies', async () => {
    const handled = await Effect.gen(function* () {
      const secondUnlocked = yield* Deferred.make<string>()
      const notifier = Layer.succeed(AchievementNotifier, {
        notify: (userId) =>
          userId === 'user-1'
            ? Effect.die('notifier exploded')
            : Effect.asVoid(Deferred.succeed(secondUnlocked, userId)),
        subscribe: Effect.die('subscribe not implemented in tests'),
      })

      return yield* Effect.gen(function* () {
        yield* startAchievementSubscriber
        const bus = yield* EventBus
        yield* bus.publish({
          _tag: 'PlantCreated',
          userId: 'user-1',
          plantId: 'plant-1',
        })
        yield* bus.publish({
          _tag: 'PlantCreated',
          userId: 'user-2',
          plantId: 'plant-2',
        })
        return yield* Deferred.await(secondUnlocked).pipe(
          Effect.timeoutOption('1 second')
        )
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            InMemoryEventBusLive,
            notifier,
            createMockAchievementRepository({ achievements: [], plantCount: 1 })
          )
        )
      )
    }).pipe(
      Effect.scoped,
      Effect.provideService(References.MinimumLogLevel, 'None'),
      Effect.runPromise
    )

    expect(handled).toEqual(Option.some('user-2'))
  })
})
