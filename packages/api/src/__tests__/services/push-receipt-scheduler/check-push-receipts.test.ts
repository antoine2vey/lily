import { createMockAlerter } from '@lily/api/__tests__/mocks/alerter'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import {
  createFakeExpoPushClient,
  createInMemoryPendingPushReceipts,
} from '@lily/api/__tests__/mocks/expo-push'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import type { PendingReceipt } from '@lily/api/services/push/pending-push-receipts'
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
} from 'effect'
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
  const capture = Logger.make(({ logLevel, message }) => {
    if (logLevel === 'Warn') warnings.push(message)
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
  return { expo, pending, run, isActive, alerts: alerter.events, warnings }
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

    const receiptOf = (code: ErrorCode | 'ok'): ExpoPushReceipt =>
      code === 'ok'
        ? { status: 'ok' }
        : {
            status: 'error',
            message: `failed with ${code}`,
            ...(code === undefined ? {} : { details: { error: code } }),
          }

    const receiptsOf = (codes: ReadonlyArray<ErrorCode | 'ok'>) => ({
      pending: Array.map(codes, (_, i) =>
        pendingReceipt(`t-${i}`, `ExponentPushToken[${i}]`, minutesAgo(30))
      ),
      receipts: Record.fromEntries(
        Array.map(codes, (code, i) => [`t-${i}`, receiptOf(code)])
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
            {
              code: 'MessageRateExceeded',
              count: 2,
              message: 'failed with MessageRateExceeded',
            },
          ],
          [
            'Expo push receipt error',
            {
              code: 'DeviceNotRegistered',
              count: 1,
              message: 'failed with DeviceNotRegistered',
            },
          ],
          [
            'Expo push receipt error',
            {
              code: 'ProviderError',
              count: 1,
              message: 'failed with ProviderError',
            },
          ],
          [
            'Expo push receipt error',
            { code: 'Unknown', count: 1, message: 'failed with undefined' },
          ],
        ])
      )
      expect(warnings).toHaveLength(4)
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
          message:
            '2 push receipts failed with InvalidCredentials: failed with InvalidCredentials',
        },
        {
          _tag: 'ProviderError',
          provider: 'expo-push',
          errorTag: 'MessageTooBig',
          message:
            '1 push receipts failed with MessageTooBig: failed with MessageTooBig',
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
