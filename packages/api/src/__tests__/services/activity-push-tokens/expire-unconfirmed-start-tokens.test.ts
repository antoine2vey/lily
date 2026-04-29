import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import type { ActivityPushToken } from '@lily/shared'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const baseStart = (
  overrides: Partial<ActivityPushToken>
): ActivityPushToken => ({
  id: crypto.randomUUID(),
  userId: 'user-1',
  deviceTokenId: 'device-1',
  kind: 'start',
  activityId: null,
  token: 'tok',
  status: 'active',
  startedAt: new Date('2026-04-01'),
  endsAt: null,
  lastConfirmedAt: null,
  lastFailedAt: null,
  updatedAt: new Date('2026-04-01'),
  ...overrides,
})

describe('expireUnconfirmedStartTokens', () => {
  const NOW = new Date('2026-04-29T12:00:00Z')
  const UNCONFIRMED_CUTOFF = new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000)
  const CONFIRMED_CUTOFF = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)

  it('expires unconfirmed start-tokens older than the unconfirmed cutoff', async () => {
    const old = baseStart({
      id: 'old-unconfirmed',
      startedAt: new Date('2026-04-01'),
    })
    const fresh = baseStart({
      id: 'fresh-unconfirmed',
      startedAt: new Date('2026-04-28'),
    })
    const layer = createMockActivityPushTokenRepository({
      tokens: [old, fresh],
    })

    const count = await Effect.runPromise(
      Effect.flatMap(ActivityPushTokenRepository, (r) =>
        r.expireUnconfirmedStartTokens({
          unconfirmedOlderThan: UNCONFIRMED_CUTOFF,
          confirmedOlderThan: CONFIRMED_CUTOFF,
        })
      ).pipe(Effect.provide(layer))
    )

    expect(count).toBe(1)
    const remaining = await Effect.runPromise(
      Effect.flatMap(ActivityPushTokenRepository, (r) =>
        r.findStartTokensByUserId('user-1')
      ).pipe(Effect.provide(layer))
    )
    expect(remaining.map((t) => t.id)).toEqual(['fresh-unconfirmed'])
  })

  it('expires confirmed start-tokens whose confirmation is older than the confirmed cutoff', async () => {
    const stale = baseStart({
      id: 'stale-confirmed',
      lastConfirmedAt: new Date('2026-03-01'),
    })
    const recent = baseStart({
      id: 'recent-confirmed',
      lastConfirmedAt: new Date('2026-04-25'),
    })
    const layer = createMockActivityPushTokenRepository({
      tokens: [stale, recent],
    })

    const count = await Effect.runPromise(
      Effect.flatMap(ActivityPushTokenRepository, (r) =>
        r.expireUnconfirmedStartTokens({
          unconfirmedOlderThan: UNCONFIRMED_CUTOFF,
          confirmedOlderThan: CONFIRMED_CUTOFF,
        })
      ).pipe(Effect.provide(layer))
    )

    expect(count).toBe(1)
    const remaining = await Effect.runPromise(
      Effect.flatMap(ActivityPushTokenRepository, (r) =>
        r.findStartTokensByUserId('user-1')
      ).pipe(Effect.provide(layer))
    )
    expect(remaining.map((t) => t.id)).toEqual(['recent-confirmed'])
  })

  it('leaves update-tokens untouched', async () => {
    const updateRow: ActivityPushToken = {
      ...baseStart({ id: 'upd' }),
      kind: 'update',
      activityId: 'a-1',
      startedAt: new Date('2026-01-01'),
    }
    const layer = createMockActivityPushTokenRepository({ tokens: [updateRow] })

    const count = await Effect.runPromise(
      Effect.flatMap(ActivityPushTokenRepository, (r) =>
        r.expireUnconfirmedStartTokens({
          unconfirmedOlderThan: UNCONFIRMED_CUTOFF,
          confirmedOlderThan: CONFIRMED_CUTOFF,
        })
      ).pipe(Effect.provide(layer))
    )

    expect(count).toBe(0)
  })
})
