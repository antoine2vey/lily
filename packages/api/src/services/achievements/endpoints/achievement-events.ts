import { HttpServerResponse } from '@effect/platform'
import { AchievementNotifier } from '@lily/api/services/achievements/notifier'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect, Schedule, Stream } from 'effect'

const encoder = new TextEncoder()

export const achievementEvents = () =>
  Effect.gen(function* () {
    const { id: userId } = yield* CurrentUser
    const notifier = yield* AchievementNotifier

    const eventStream = Stream.unwrapScoped(
      Effect.gen(function* () {
        const dequeue = yield* notifier.subscribe
        return Stream.fromQueue(dequeue).pipe(
          Stream.filter((event) => event.userId === userId),
          Stream.map((event) =>
            encoder.encode(`data: ${JSON.stringify({ key: event.key })}\n\n`)
          )
        )
      })
    )

    const heartbeat = Stream.repeat(
      Stream.succeed(encoder.encode(': heartbeat\n\n')),
      Schedule.spaced('15 seconds')
    )

    const merged = Stream.merge(eventStream, heartbeat)

    return HttpServerResponse.stream(merged, {
      contentType: 'text/event-stream; charset=utf-8',
      headers: {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  })
