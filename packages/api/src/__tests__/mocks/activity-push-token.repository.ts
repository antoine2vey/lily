import {
  ActivityPushTokenRepository,
  type IActivityPushTokenRepository,
} from '@lily/api/repositories/activity-push-token.repository'
import type { ActivityPushToken } from '@lily/shared'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export interface MockActivityPushTokenData {
  tokens?: ActivityPushToken[]
}

export const createMockActivityPushTokenRepository = (
  data: MockActivityPushTokenData = {}
): Layer.Layer<ActivityPushTokenRepository> => {
  const store: ActivityPushToken[] = [...(data.tokens ?? [])]

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
  }

  return Layer.succeed(ActivityPushTokenRepository, service)
}
