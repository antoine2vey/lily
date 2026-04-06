import {
  type IPushService,
  type PushMessage,
  PushService,
  type PushTicket,
} from '@lily/shared/server'
import { Array, Effect, Layer } from 'effect'

const makeTicket = (_message: PushMessage): PushTicket => ({
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
        return makeTicket(message)
      }),

    sendBatch: (messages: PushMessage[]) =>
      Effect.gen(function* () {
        yield* Effect.log(
          `[DEV] Push batch (${Array.length(messages)} messages):\n${Array.map(messages, (m) => `  → ${m.to}: ${m.title}`).join('\n')}`
        )
        return Array.map(messages, makeTicket)
      }),
  } satisfies IPushService)
)
