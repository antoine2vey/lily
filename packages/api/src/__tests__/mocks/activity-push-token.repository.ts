import {
  ActivityPushTokenRepository,
  type IActivityPushTokenRepository,
} from '@lily/api/repositories/activity-push-token.repository'
import type { ActivityPushToken } from '@lily/shared'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export interface MockActivityPushTokenData {
  tokens?: ActivityPushToken[]
  // Optional set of device_token_ids treated as inactive when the orphan
  // cleanup query checks `device_tokens.is_active = false`. Tests that
  // exercise endOrphanStartTokens populate this; everything else defaults
  // to "every device is active" (no orphans).
  inactiveDeviceTokenIds?: ReadonlyArray<string>
}

export const createMockActivityPushTokenRepository = (
  data: MockActivityPushTokenData = {}
): Layer.Layer<ActivityPushTokenRepository> => {
  const store: ActivityPushToken[] = [...(data.tokens ?? [])]
  const inactiveDevices = new Set<string>(data.inactiveDeviceTokenIds ?? [])

  const service: IActivityPushTokenRepository = {
    findStartTokensByUserId: (userId) =>
      Effect.succeed(
        Array.filter(
          store,
          (t) =>
            t.userId === userId && t.kind === 'start' && t.status === 'active'
        )
      ),
    findActiveActivityByUserId: (userId) =>
      Effect.succeed(
        Option.getOrNull(
          Array.findFirst(
            store,
            (t) =>
              t.userId === userId &&
              t.kind === 'update' &&
              t.status === 'active'
          )
        )
      ),
    findAllActiveUpdateTokens: () =>
      Effect.succeed(
        Array.filter(store, (t) => t.kind === 'update' && t.status === 'active')
      ),
    findByActivityId: (activityId) =>
      Effect.succeed(
        Option.getOrNull(
          Array.findFirst(store, (t) => t.activityId === activityId)
        )
      ),
    upsertStartToken: (d) =>
      Effect.sync(() => {
        const row: ActivityPushToken = {
          id: crypto.randomUUID(),
          userId: d.userId,
          deviceTokenId: d.deviceTokenId,
          kind: 'start',
          activityId: null,
          token: d.token,
          status: 'active',
          startedAt: new Date(),
          endsAt: null,
          lastConfirmedAt: null,
          lastFailedAt: null,
          updatedAt: new Date(),
        }
        store.push(row)
        return row
      }),
    createActivity: (d) =>
      Effect.sync(() => {
        const row: ActivityPushToken = {
          id: crypto.randomUUID(),
          userId: d.userId,
          deviceTokenId: d.deviceTokenId,
          kind: 'update',
          activityId: d.activityId,
          token: d.token,
          status: 'active',
          startedAt: new Date(),
          endsAt: d.endsAt,
          lastConfirmedAt: null,
          lastFailedAt: null,
          updatedAt: new Date(),
        }
        store.push(row)
        return row
      }),
    markEnded: (activityId) =>
      Effect.sync(() =>
        pipe(
          Array.findFirstIndex(store, (t) => t.activityId === activityId),
          Option.flatMap((idx) =>
            pipe(
              Array.get(store, idx),
              Option.map((row) => {
                const updated: ActivityPushToken = {
                  ...row,
                  status: 'ended',
                  updatedAt: new Date(),
                }
                store[idx] = updated
                return updated
              })
            )
          ),
          Option.getOrNull
        )
      ),
    expireStaleOlderThan: (cutoff) =>
      Effect.sync(() => {
        const cutoffMs = cutoff.getTime()
        let count = 0
        Array.forEach(store, (row, i) => {
          if (
            row.kind === 'update' &&
            row.status === 'active' &&
            row.startedAt.getTime() < cutoffMs
          ) {
            store[i] = { ...row, status: 'expired', updatedAt: new Date() }
            count++
          }
        })
        return count
      }),
    markStartTokenConfirmed: (userId, deviceTokenId) =>
      Effect.sync(() => {
        let count = 0
        const now = new Date()
        Array.forEach(store, (row, i) => {
          if (
            row.kind === 'start' &&
            row.userId === userId &&
            row.deviceTokenId === deviceTokenId
          ) {
            store[i] = { ...row, lastConfirmedAt: now, updatedAt: now }
            count++
          }
        })
        return count
      }),
    endOrphanStartTokens: (userId, keepDeviceTokenId) =>
      Effect.sync(() => {
        let count = 0
        Array.forEach(store, (row, i) => {
          if (
            row.kind === 'start' &&
            row.status === 'active' &&
            row.userId === userId &&
            row.deviceTokenId !== keepDeviceTokenId &&
            inactiveDevices.has(row.deviceTokenId)
          ) {
            store[i] = { ...row, status: 'ended', updatedAt: new Date() }
            count++
          }
        })
        return count
      }),
    expireUnconfirmedStartTokens: (params) =>
      Effect.sync(() => {
        const unconfirmedMs = params.unconfirmedOlderThan.getTime()
        const confirmedMs = params.confirmedOlderThan.getTime()
        let count = 0
        Array.forEach(store, (row, i) => {
          if (row.kind !== 'start' || row.status !== 'active') return
          const isUnconfirmedAndOld =
            row.lastConfirmedAt === null &&
            row.startedAt.getTime() < unconfirmedMs
          const isStaleConfirmed =
            row.lastConfirmedAt !== null &&
            row.lastConfirmedAt.getTime() < confirmedMs
          if (isUnconfirmedAndOld || isStaleConfirmed) {
            store[i] = { ...row, status: 'expired', updatedAt: new Date() }
            count++
          }
        })
        return count
      }),
  }

  return Layer.succeed(ActivityPushTokenRepository, service)
}
