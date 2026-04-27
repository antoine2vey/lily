import {
  type IPushService,
  type LiveActivityPushMessage,
  type PushMessage,
  PushSendError,
  PushService,
  type PushTicket,
} from '@lily/shared/server'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export interface MockPushServiceOptions {
  onSend?: (message: PushMessage) => void
  onSendBatch?: (messages: PushMessage[]) => void
  onSendLiveActivity?: (message: LiveActivityPushMessage) => void
  shouldFail?: boolean
  failureMessage?: string
}

export const createMockPushService = (
  options: MockPushServiceOptions = {}
): Layer.Layer<PushService> => {
  const service: IPushService = {
    send: (message) =>
      Effect.gen(function* () {
        if (options.onSend) {
          options.onSend(message)
        }

        if (options.shouldFail) {
          return yield* new PushSendError({
            message: pipe(
              Option.fromNullable(options.failureMessage),
              Option.getOrElse(() => 'Mock push failure')
            ),
          })
        }

        return {
          id: `ticket-${crypto.randomUUID()}`,
          status: 'ok',
        } satisfies PushTicket
      }),

    sendBatch: (messages) =>
      Effect.gen(function* () {
        if (options.onSendBatch) {
          options.onSendBatch(messages)
        }

        if (options.shouldFail) {
          return yield* new PushSendError({
            message: pipe(
              Option.fromNullable(options.failureMessage),
              Option.getOrElse(() => 'Mock push batch failure')
            ),
          })
        }

        return Array.map(messages, () => ({
          id: `ticket-${crypto.randomUUID()}`,
          status: 'ok' as const,
        })) satisfies PushTicket[]
      }),

    sendLiveActivity: (message) =>
      Effect.gen(function* () {
        if (options.onSendLiveActivity) {
          options.onSendLiveActivity(message)
        }

        if (options.shouldFail) {
          return yield* new PushSendError({
            message: pipe(
              Option.fromNullable(options.failureMessage),
              Option.getOrElse(() => 'Mock live activity failure')
            ),
          })
        }

        return {
          id: `ticket-${crypto.randomUUID()}`,
          status: 'ok',
        } satisfies PushTicket
      }),
  }

  return Layer.succeed(PushService, service)
}

// Helper to create a push service that succeeds
export const createSuccessPushService = (): Layer.Layer<PushService> =>
  createMockPushService()

// Helper to create a push service that always fails
export const createFailingPushService = (
  errorMessage = 'Push notification failed'
): Layer.Layer<PushService> =>
  createMockPushService({
    shouldFail: true,
    failureMessage: errorMessage,
  })
