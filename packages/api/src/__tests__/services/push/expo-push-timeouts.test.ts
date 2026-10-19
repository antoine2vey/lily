import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import { createInMemoryPendingPushReceipts } from '@lily/api/__tests__/mocks/expo-push'
import { ExpoPlusApnsPushServiceLive } from '@lily/api/services/push/expo-plus-apns.provider'
import { ExpoPushClient } from '@lily/api/services/push/expo-push-client'
import { checkPushReceipts } from '@lily/api/services/push-receipt-scheduler/scheduler'
import { PushSendError, PushService } from '@lily/shared/server'
import { DateTime, Duration, Effect, Exit, Fiber, Layer, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The real SDK client with its two HTTP calls replaced by ones that never
// settle, like an Expo endpoint that accepted the connection and went quiet.
const requests: string[] = []

vi.mock('expo-server-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('expo-server-sdk')>()
  class SilentExpo extends actual.Expo {
    override sendPushNotificationsAsync() {
      requests.push('send')
      return new Promise<never>(() => {})
    }
    override getPushNotificationReceiptsAsync() {
      requests.push('getReceipts')
      return new Promise<never>(() => {})
    }
  }
  return { ...actual, Expo: SilentExpo, default: SilentExpo }
})

beforeEach(() => {
  requests.length = 0
})

const DEADLINE = Duration.seconds(15)
const TICKET = {
  ticketId: 'ticket-1',
  token: 'ExponentPushToken[device]',
  sentAt: DateTime.makeUnsafe(-Duration.toMillis(Duration.hours(1))),
}

const setup = () => {
  const pending = createInMemoryPendingPushReceipts([TICKET])
  const deps = Layer.mergeAll(
    ExpoPushClient.layer,
    pending.layer,
    createMockDeviceTokenRepository([]),
    MockAlerterLive
  )
  return {
    pending,
    layer: Layer.mergeAll(
      ExpoPlusApnsPushServiceLive.pipe(Layer.provide(deps)),
      deps,
      TestClock.layer()
    ),
  }
}

const sendBatch = Effect.gen(function* () {
  const push = yield* PushService
  return yield* push.sendBatch([
    { to: 'ExponentPushToken[device]', title: 'Water', body: 'Monstera' },
  ])
})

describe('Expo push against an endpoint that never responds', () => {
  it.each([
    { name: 'sendBatch', run: sendBatch, request: 'send' },
    {
      name: 'checkPushReceipts',
      run: checkPushReceipts,
      request: 'getReceipts',
    },
  ])('$name fails with PushSendError after 15 s', ({ run, request }) => {
    const { pending, layer } = setup()
    return Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(run)

      yield* TestClock.adjust(Duration.subtract(DEADLINE, Duration.seconds(1)))
      expect(fiber.pollUnsafe()).toBeUndefined()
      expect(requests).toEqual([request])

      yield* TestClock.adjust(Duration.seconds(1))
      const exit = yield* Fiber.await(fiber)

      const error = Exit.findErrorOption(exit).pipe(Option.getOrUndefined)
      expect(error).toBeInstanceOf(PushSendError)
      expect((error as PushSendError).message).toContain('no response within')
      expect(pending.current()).toEqual([TICKET])
    }).pipe(Effect.provide(layer), Effect.runPromise)
  })
})
