import { inspect } from 'node:util'
import { createMockAlerter } from '@lily/api/__tests__/mocks/alerter'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import {
  createFakeExpoPushClient,
  createInMemoryPendingPushReceipts,
} from '@lily/api/__tests__/mocks/expo-push'
import type { ApnsClient } from '@lily/api/services/push/apns-live-activity'
import { ExpoPlusApnsPushServiceLive } from '@lily/api/services/push/expo-plus-apns.provider'
import {
  type LiveActivityContentState,
  type LiveActivityPushMessage,
  PushService,
} from '@lily/shared/server'
import {
  ConfigProvider,
  Effect,
  Layer,
  Logger,
  References,
  Tracer,
} from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apns = vi.hoisted(() => ({
  sent: [] as Array<Parameters<ApnsClient['send']>[0]>,
  failWith: undefined as string | undefined,
}))

vi.mock(
  '@lily/api/services/push/apns-live-activity',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('@lily/api/services/push/apns-live-activity')
      >()
    return {
      ...original,
      makeApnsClient: (): ApnsClient => ({
        send: (args) =>
          Effect.suspend(() => {
            apns.sent.push(args)
            return apns.failWith === undefined
              ? Effect.succeed({ apnsId: 'apns-1' })
              : Effect.fail(
                  new original.ApnsSendError({
                    message: `APNs LA send failed: ${apns.failWith}`,
                    status: 400,
                    reason: apns.failWith,
                  })
                )
          }),
      }),
    }
  }
)

const TOKEN = '80f3c5e1a2b4d6f8'.repeat(4)

const contentState: LiveActivityContentState = {
  schemaVersion: 1,
  totalPlants: 2,
  groups: [],
  headline: '2 plants need water',
  title: 'Your plants miss you',
  completedToday: 0,
  updatedAt: new Date('2026-11-05T08:00:00Z'),
}

const update: LiveActivityPushMessage = {
  _tag: 'LiveActivityUpdate',
  to: TOKEN,
  contentState,
}

const messages: ReadonlyArray<LiveActivityPushMessage> = [
  {
    _tag: 'LiveActivityStart',
    to: TOKEN,
    attributes: { userId: 'user-1', activityId: 'activity-1' },
    contentState,
    alert: { title: 'Water', body: 'Monstera is thirsty' },
  },
  update,
  { _tag: 'LiveActivityEnd', to: TOKEN, dismissalPolicy: 'immediate' },
]

// The private key is not a PEM, so a real APNs client would fail minting its
// JWT before opening any connection.
const apnsConfig = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    APNS_TEAM_ID: 'TEAM',
    APNS_KEY_ID: 'KEY',
    APNS_PRIVATE_KEY: 'not-a-pem',
    APNS_BUNDLE_ID: 'com.example.app',
  })
)

const sendUnderTelemetry = async (message: LiveActivityPushMessage) => {
  const spans: Tracer.NativeSpan[] = []
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  const logs: unknown[] = []
  const captureLogs = Logger.make(({ message, fiber }) => {
    logs.push({
      message,
      annotations: fiber.getRef(References.CurrentLogAnnotations),
    })
  })
  const alerter = createMockAlerter()
  const deps = Layer.mergeAll(
    createFakeExpoPushClient().layer,
    createInMemoryPendingPushReceipts().layer,
    createMockDeviceTokenRepository([]),
    alerter.layer,
    apnsConfig
  )

  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const push = yield* PushService
      return yield* push.sendLiveActivity(message)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          ExpoPlusApnsPushServiceLive.pipe(Layer.provide(deps)),
          Logger.layer([captureLogs, Logger.tracerLogger])
        )
      ),
      Effect.provideService(References.MinimumLogLevel, 'All'),
      Effect.withTracer(tracer)
    )
  )

  const telemetry = inspect(
    {
      spans: spans.map((span) => ({
        name: span.name,
        attributes: span.attributes,
        events: span.events,
        exit: span.status._tag === 'Ended' ? span.status.exit : undefined,
      })),
      logs,
      alerts: alerter.events,
    },
    { depth: Number.POSITIVE_INFINITY, maxArrayLength: null }
  )
  return { exit, spans, telemetry }
}

beforeEach(() => {
  apns.sent.length = 0
  apns.failWith = undefined
})

describe('ExpoPlusApns sendLiveActivity telemetry', () => {
  it.each(messages)(
    'keeps the device token out of spans and logs on $_tag',
    async (message) => {
      const { exit, spans, telemetry } = await sendUnderTelemetry(message)

      expect(exit._tag).toBe('Success')
      expect(apns.sent.map((args) => args.deviceToken)).toEqual([TOKEN])
      expect(spans.map((span) => span.name)).toContain(
        'ExpoPlusApns.sendLiveActivity'
      )
      expect(telemetry).not.toContain(TOKEN)
    }
  )

  it('keeps the device token out of spans, logs and alerts when APNs rejects it', async () => {
    apns.failWith = 'BadDeviceToken'

    const { exit, telemetry } = await sendUnderTelemetry(update)

    expect(exit._tag).toBe('Failure')
    expect(telemetry).toContain('PushTokenInvalidatedError')
    expect(telemetry).not.toContain(TOKEN)
  })
})
