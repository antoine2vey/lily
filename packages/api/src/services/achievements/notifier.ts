import type { AchievementKey } from '@lily/shared'
import { Context, Effect, Layer, PubSub, type Queue, type Scope } from 'effect'

export interface AchievementEvent {
  readonly userId: string
  readonly key: AchievementKey
}

export interface IAchievementNotifier {
  readonly notify: (userId: string, key: AchievementKey) => Effect.Effect<void>
  readonly subscribe: Effect.Effect<
    Queue.Dequeue<AchievementEvent>,
    never,
    Scope.Scope
  >
}

export class AchievementNotifier extends Context.Tag('AchievementNotifier')<
  AchievementNotifier,
  IAchievementNotifier
>() {}

export const AchievementNotifierLive = Layer.effect(
  AchievementNotifier,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<AchievementEvent>()

    return {
      notify: (userId: string, key: AchievementKey) =>
        PubSub.publish(pubsub, { userId, key }).pipe(
          Effect.catchAll((error) =>
            Effect.logError('Failed to publish achievement event', error)
          ),
          Effect.asVoid
        ),
      subscribe: PubSub.subscribe(pubsub),
    }
  })
)
