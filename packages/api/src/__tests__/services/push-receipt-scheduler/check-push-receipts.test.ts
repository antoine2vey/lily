import { createMockAlerter } from '@lily/api/__tests__/mocks/alerter'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import {
  createFakeExpoPushClient,
  createInMemoryPendingPushReceipts,
} from '@lily/api/__tests__/mocks/expo-push'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { Alerter } from '@lily/api/services/alerting'
import {
  type AlertEvent,
  makeAlerter,
} from '@lily/api/services/alerting/service'
import {
  PendingPushReceipts,
  type PendingReceipt,
} from '@lily/api/services/push/pending-push-receipts'
import { checkPushReceipts } from '@lily/api/services/push-receipt-scheduler/scheduler'
import type { DeviceToken } from '@lily/shared/device-token'
import {
  Array,
  DateTime,
  Duration,
  Effect,
  Layer,
  Logger,
  Record,
  References,
} from 'effect'
import { TestClock } from 'effect/testing'
import type { ExpoPushErrorReceipt, ExpoPushReceipt } from 'expo-server-sdk'
import { describe, expect, it } from 'vitest'

const deviceToken = (token: string, updatedAt: Date): DeviceToken => ({
  id: `id-${token}`,
  token,
  platform: 'android',
  isActive: true,
  userId: 'user-1',
  createdAt: new Date('2026-01-01'),
  updatedAt,
})

const minutesAgo = (minutes: number) =>
  DateTime.subtractDuration(DateTime.nowUnsafe(), Duration.minutes(minutes))

const pendingReceipt = (
  ticketId: string,
  token: string,
  sentAt: DateTime.Utc
): PendingReceipt => ({ ticketId, token, sentAt })

const notRegistered: ExpoPushReceipt = {
  status: 'error',
  message: 'gone',
  details: { error: 'DeviceNotRegistered' },
}

const setup = (
  devices: DeviceToken[],
  pendingReceipts: PendingReceipt[],
  receipts: Record<string, ExpoPushReceipt>
) => {
  const expo = createFakeExpoPushClient({ receipts })
  const pending = createInMemoryPendingPushReceipts(pendingReceipts)
  const repo = createMockDeviceTokenRepository(devices)
  const alerter = createMockAlerter()
  const warnings: unknown[] = []
  const infos: unknown[] = []
  const capture = Logger.make(({ logLevel, message }) => {
    if (logLevel === 'Warn') warnings.push(message)
    if (logLevel === 'Info') infos.push(message)
  })
  const layer = Layer.mergeAll(
    expo.layer,
    pending.layer,
    repo,
    alerter.layer,
    Logger.layer([capture])
  )
  const run = <A, E>(
    effect: Effect.Effect<A, E, Layer.Success<typeof layer>>
  ) => Effect.runPromise(effect.pipe(Effect.provide(layer)))
  const isActive = (token: string) =>
    run(
      Effect.gen(function* () {
        const repo = yield* DeviceTokenRepository
        return (yield* repo.findByToken(token))?.isActive
      })
    )
  return {
    expo,
    pending,
    run,
    isActive,
    alerts: alerter.events,
    warnings,
    infos,
  }
}

describe('checkPushReceipts', () => {
  const longAgo = new Date('2026-01-01')

  it('deactivates a token whose receipt reports DeviceNotRegistered', async () => {
    const { run, isActive, pending } = setup(
      [
        deviceToken('ExponentPushToken[gone]', longAgo),
        deviceToken('ExponentPushToken[alive]', longAgo),
      ],
      [
        pendingReceipt('t-gone', 'ExponentPushToken[gone]', minutesAgo(30)),
        pendingReceipt('t-alive', 'ExponentPushToken[alive]', minutesAgo(30)),
      ],
      { 't-gone': notRegistered, 't-alive': { status: 'ok' } }
    )

    await run(checkPushReceipts)

    expect(await isActive('ExponentPushToken[gone]')).toBe(false)
    expect(await isActive('ExponentPushToken[alive]')).toBe(true)
    expect(pending.current()).toEqual([])
  })

  it('keeps a token the device re-registered after the push was sent', async () => {
    const sentAt = minutesAgo(30)
    const { run, isActive } = setup(
      [deviceToken('ExponentPushToken[back]', new Date())],
      [pendingReceipt('t-back', 'ExponentPushToken[back]', sentAt)],
      { 't-back': notRegistered }
    )

    await run(checkPushReceipts)

    expect(await isActive('ExponentPushToken[back]')).toBe(true)
  })

  it('leaves tickets too recent to have a receipt untouched', async () => {
    const { run, expo, pending } = setup(
      [deviceToken('ExponentPushToken[new]', longAgo)],
      [pendingReceipt('t-new', 'ExponentPushToken[new]', minutesAgo(1))],
      {}
    )

    await run(checkPushReceipts)

    expect(expo.receiptRequests).toEqual([])
    expect(pending.current().map((r) => r.ticketId)).toEqual(['t-new'])
  })

  it('keeps an unanswered ticket until receipts expire, then drops it', async () => {
    const { run, pending } = setup(
      [],
      [
        pendingReceipt('t-waiting', 'ExponentPushToken[a]', minutesAgo(30)),
        pendingReceipt(
          't-expired',
          'ExponentPushToken[b]',
          minutesAgo(25 * 60)
        ),
      ],
      {}
    )

    await run(checkPushReceipts)

    expect(pending.current().map((r) => r.ticketId)).toEqual(['t-waiting'])
  })

  describe('error receipts', () => {
    type ErrorCode = NonNullable<ExpoPushErrorReceipt['details']>['error']

    const tokenOf = (i: number) => `ExponentPushToken[device-${i}]`

    // Expo's receipt text can name the device token.
    const receiptOf = (
      code: ErrorCode | 'ok',
      token: string
    ): ExpoPushReceipt =>
      code === 'ok'
        ? { status: 'ok' }
        : {
            status: 'error',
            message: `"${token}" failed with ${code}`,
            ...(code === undefined ? {} : { details: { error: code } }),
          }

    const receiptsOf = (codes: ReadonlyArray<ErrorCode | 'ok'>) => ({
      pending: Array.map(codes, (_, i) =>
        pendingReceipt(`t-${i}`, tokenOf(i), minutesAgo(30))
      ),
      receipts: Record.fromEntries(
        Array.map(codes, (code, i) => [`t-${i}`, receiptOf(code, tokenOf(i))])
      ),
    })

    it('logs each error code once with its count', async () => {
      const { pending, receipts } = receiptsOf([
        'MessageRateExceeded',
        'MessageRateExceeded',
        'DeviceNotRegistered',
        'ProviderError',
        undefined,
        'ok',
      ])
      const { run, warnings } = setup([], pending, receipts)

      await run(checkPushReceipts)

      expect(warnings).toEqual(
        expect.arrayContaining([
          [
            'Expo push receipt error',
            { code: 'MessageRateExceeded', count: 2 },
          ],
          [
            'Expo push receipt error',
            { code: 'DeviceNotRegistered', count: 1 },
          ],
          ['Expo push receipt error', { code: 'ProviderError', count: 1 }],
          ['Expo push receipt error', { code: 'Unknown', count: 1 }],
        ])
      )
      expect(warnings).toHaveLength(4)
    })

    it('logs no push token for a receipt whose Expo text names it', async () => {
      const { pending, receipts } = receiptsOf(['DeviceNotRegistered'])
      const { run, warnings } = setup([], pending, receipts)

      await run(checkPushReceipts)

      expect(JSON.stringify(warnings)).not.toContain('device-0')
    })

    it('alerts once per tick on InvalidCredentials and on MessageTooBig', async () => {
      const { pending, receipts } = receiptsOf([
        'InvalidCredentials',
        'InvalidCredentials',
        'MessageTooBig',
      ])
      const { run, alerts } = setup([], pending, receipts)

      await run(checkPushReceipts)

      expect(alerts).toEqual([
        {
          _tag: 'ProviderError',
          provider: 'expo-push',
          errorTag: 'InvalidCredentials',
          message: '2 push receipts failed with InvalidCredentials',
          dedupeWindow: Duration.hours(1),
        },
        {
          _tag: 'ProviderError',
          provider: 'expo-push',
          errorTag: 'MessageTooBig',
          message: '1 push receipt failed with MessageTooBig',
          dedupeWindow: Duration.hours(1),
        },
      ])
    })

    it('alerts without the push token that Expo names in its receipt text', async () => {
      const { pending, receipts } = receiptsOf([
        'InvalidCredentials',
        'MessageTooBig',
      ])
      const { run, alerts } = setup([], pending, receipts)

      await run(checkPushReceipts)

      expect(Array.length(alerts)).toBe(2)
      expect(JSON.stringify(alerts)).not.toMatch(/device-0|device-1/)
    })

    it('alerts on a code that keeps failing at most once an hour across ticks', async () => {
      const ticks = Array.range(0, 4)
      const { receipts } = receiptsOf(
        Array.map(ticks, () => 'InvalidCredentials' as const)
      )
      const expo = createFakeExpoPushClient({ receipts })
      const pending = createInMemoryPendingPushReceipts()
      const delivered: AlertEvent[] = []

      const alertsAfterEachTick = await Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse('2026-11-04T08:00:00Z'))
        const alerter = yield* makeAlerter(
          (event) =>
            Effect.sync(() => {
              delivered.push(event)
            }),
          {
            environment: 'test',
            dedupeWindow: Duration.minutes(5),
            warningDedupeWindow: Duration.minutes(15),
          }
        )
        return yield* Effect.forEach(ticks, (i) =>
          Effect.gen(function* () {
            const receipts = yield* PendingPushReceipts
            const now = yield* DateTime.now
            yield* receipts.add([
              pendingReceipt(
                `t-${i}`,
                `ExponentPushToken[${i}]`,
                DateTime.subtractDuration(now, Duration.minutes(30))
              ),
            ])
            yield* checkPushReceipts
            yield* TestClock.adjust(Duration.millis(10))
            const count = Array.length(delivered)
            yield* TestClock.adjust(
              Duration.subtract(Duration.minutes(15), Duration.millis(10))
            )
            return count
          })
        ).pipe(Effect.provideService(Alerter, alerter))
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            expo.layer,
            pending.layer,
            createMockDeviceTokenRepository([]),
            TestClock.layer()
          )
        ),
        Effect.provideService(References.MinimumLogLevel, 'None'),
        Effect.runPromise
      )

      expect(alertsAfterEachTick).toEqual([1, 1, 1, 1, 2])
    })

    it('reports each error code with its count in the tick log', async () => {
      const { pending, receipts } = receiptsOf([
        'MessageRateExceeded',
        'MessageRateExceeded',
        'DeviceNotRegistered',
        'InvalidCredentials',
        'ok',
      ])
      const { run, infos } = setup([], pending, receipts)

      await run(checkPushReceipts)

      expect(infos).toContainEqual([
        'Checked Expo push receipts',
        {
          checked: 5,
          settled: 5,
          unregistered: 1,
          errorsByCode: {
            MessageRateExceeded: 2,
            DeviceNotRegistered: 1,
            InvalidCredentials: 1,
          },
        },
      ])
    })

    it.each([
      'MessageRateExceeded',
      'DeviceNotRegistered',
      'ProviderError',
      'DeveloperError',
      'ExpoError',
      undefined,
    ] as const)('does not alert on a %s receipt', async (code) => {
      const { pending, receipts } = receiptsOf([code])
      const { run, alerts, warnings } = setup([], pending, receipts)

      await run(checkPushReceipts)

      expect(alerts).toEqual([])
      expect(warnings).toHaveLength(1)
    })

    it('logs nothing and alerts nothing when every receipt is ok', async () => {
      const { pending, receipts } = receiptsOf(['ok', 'ok'])
      const { run, alerts, warnings } = setup([], pending, receipts)

      await run(checkPushReceipts)

      expect(alerts).toEqual([])
      expect(warnings).toEqual([])
    })
  })
})
