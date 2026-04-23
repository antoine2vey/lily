import {
  type IPushService,
  type LiveActivityPushMessage,
  type PushMessage,
  PushService,
  type PushTicket,
} from '@lily/shared/server'
import { Array, Effect, Layer, Match } from 'effect'

const makeTicket = (): PushTicket => ({
  id: crypto.randomUUID(),
  status: 'ok' as const,
})

export const ConsolePushServiceLive = Layer.succeed(
  PushService,
  PushService.of({
    send: (message: PushMessage) =>
      Effect.gen(function* () {
        yield* Effect.log(
          `[DEV] Push notification → ${message.to}\n  title: ${message.title}\n  body: ${message.body}`
        )
        return makeTicket()
      }),

    sendBatch: (messages: PushMessage[]) =>
      Effect.gen(function* () {
        yield* Effect.log(
          `[DEV] Push batch (${Array.length(messages)} messages):\n${Array.map(messages, (m) => `  → ${m.to}: ${m.title}`).join('\n')}`
        )
        return Array.map(messages, makeTicket)
      }),

    sendLiveActivity: (message: LiveActivityPushMessage) =>
      Effect.gen(function* () {
        const summary = Match.value(message).pipe(
          Match.tag(
            'LiveActivityStart',
            (m) =>
              `start activityId=${m.attributes.activityId} total=${m.contentState.totalPlants}`
          ),
          Match.tag(
            'LiveActivityUpdate',
            (m) => `update total=${m.contentState.totalPlants}`
          ),
          Match.tag(
            'LiveActivityEnd',
            (m) => `end dismissal=${m.dismissalPolicy}`
          ),
          Match.exhaustive
        )
        yield* Effect.log(`[DEV] Live Activity → ${message.to}\n  ${summary}`)
        return makeTicket()
      }),
  } satisfies IPushService)
)
