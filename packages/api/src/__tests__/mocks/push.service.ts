import {
  type IPushService,
  type PushMessage,
  PushSendError,
  PushService,
  type PushTicket,
} from '@lily/shared'
import { Effect, Layer } from 'effect'

export interface MockPushServiceOptions {
  onSend?: (message: PushMessage) => void
  onSendBatch?: (messages: PushMessage[]) => void
  shouldFail?: boolean
  failureMessage?: string
}

export const createMockPushService = (
  options: MockPushServiceOptions = {}
): Layer.Layer<PushService> => {
  const service: IPushService = {
    send: (message) =>
      Effect.gen(function* () {
        options.onSend?.(message)

        if (options.shouldFail) {
          return yield* Effect.fail(
            new PushSendError({
              message: options.failureMessage ?? 'Mock push failure',
            })
          )
        }

        return {
          id: `ticket-${crypto.randomUUID()}`,
          status: 'ok',
        } satisfies PushTicket
      }),

    sendBatch: (messages) =>
      Effect.gen(function* () {
        options.onSendBatch?.(messages)

        if (options.shouldFail) {
          return yield* Effect.fail(
            new PushSendError({
              message: options.failureMessage ?? 'Mock push batch failure',
            })
          )
        }

        return messages.map(() => ({
          id: `ticket-${crypto.randomUUID()}`,
          status: 'ok' as const,
        })) satisfies PushTicket[]
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
