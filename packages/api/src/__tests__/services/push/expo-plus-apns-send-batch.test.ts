import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import {
  createFakeExpoPushClient,
  createInMemoryPendingPushReceipts,
} from '@lily/api/__tests__/mocks/expo-push'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { ExpoPlusApnsPushServiceLive } from '@lily/api/services/push/expo-plus-apns.provider'
import type { DeviceToken } from '@lily/shared/device-token'
import { PushService } from '@lily/shared/server'
import { Effect, Layer } from 'effect'
import type { ExpoPushTicket } from 'expo-server-sdk'
import { describe, expect, it } from 'vitest'

const VALID = 'ExponentPushToken[valid-device]'
const GONE = 'ExponentPushToken[uninstalled-device]'
const MALFORMED = 'not-an-expo-token'

const deviceToken = (id: string, token: string): DeviceToken => ({
  id,
  token,
  platform: 'ios',
  isActive: true,
  userId: 'user-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
})

const setup = (
  options: Parameters<typeof createFakeExpoPushClient>[0] = {}
) => {
  const expo = createFakeExpoPushClient(options)
  const pending = createInMemoryPendingPushReceipts()
  const repo = createMockDeviceTokenRepository([
    deviceToken('d-valid', VALID),
    deviceToken('d-gone', GONE),
    deviceToken('d-malformed', MALFORMED),
  ])
  const deps = Layer.mergeAll(expo.layer, pending.layer, repo, MockAlerterLive)
  const layer = Layer.mergeAll(
    ExpoPlusApnsPushServiceLive.pipe(Layer.provide(deps)),
    repo
  )
  const run = <A, E>(
    effect: Effect.Effect<A, E, PushService | DeviceTokenRepository>
  ) => Effect.runPromise(effect.pipe(Effect.provide(layer)))
  return { expo, pending, run }
}

const sendTo = (tokens: string[]) =>
  Effect.gen(function* () {
    const push = yield* PushService
    return yield* push.sendBatch(
      tokens.map((to) => ({ to, title: 'Water', body: 'Monstera is thirsty' }))
    )
  })

const isActive = (token: string) =>
  Effect.gen(function* () {
    const repo = yield* DeviceTokenRepository
    return (yield* repo.findByToken(token))?.isActive
  })

describe('ExpoPlusApns sendBatch', () => {
  it('still delivers to the valid device when another token is malformed', async () => {
    const { expo, run } = setup()

    const tickets = await run(sendTo([VALID, MALFORMED]))

    expect(expo.sent.map((m) => m.to)).toEqual([VALID])
    expect(tickets.map((t) => t.status).sort()).toEqual(['error', 'ok'])
    expect(await run(isActive(MALFORMED))).toBe(false)
    expect(await run(isActive(VALID))).toBe(true)
  })

  it('retires a token whose ticket says DeviceNotRegistered', async () => {
    const { run } = setup({
      ticketFor: (m): ExpoPushTicket =>
        m.to === GONE
          ? {
              status: 'error',
              message: 'not registered',
              details: { error: 'DeviceNotRegistered' },
            }
          : { status: 'ok', id: 'ticket-ok' },
    })

    await run(sendTo([VALID, GONE]))

    expect(await run(isActive(GONE))).toBe(false)
    expect(await run(isActive(VALID))).toBe(true)
  })

  it('records each accepted ticket with its token for the receipt check', async () => {
    const { pending, run } = setup({
      ticketFor: (m): ExpoPushTicket => ({
        status: 'ok',
        id: `ticket-for-${m.to}`,
      }),
    })

    await run(sendTo([VALID, GONE]))

    expect(
      pending.current().map(({ ticketId, token }) => ({ ticketId, token }))
    ).toEqual([
      { ticketId: `ticket-for-${VALID}`, token: VALID },
      { ticketId: `ticket-for-${GONE}`, token: GONE },
    ])
  })
})
