import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { Array, DateTime, Effect } from 'effect'

export type RetireReason = 'malformed' | 'DeviceNotRegistered'

export interface DeadToken {
  readonly token: string
  readonly sentAt: DateTime.Utc
}

// Deactivate Expo tokens that can never deliver so the worker stops sending
// to them. The app reactivates its token when it next registers, and a row
// re-registered after `sentAt` is left alone.
export const retireExpoTokens = Effect.fn('push.retireExpoTokens')(function* (
  dead: ReadonlyArray<DeadToken>,
  reason: RetireReason
) {
  if (Array.isReadonlyArrayEmpty(dead)) return
  const repo = yield* DeviceTokenRepository
  const results = yield* Effect.forEach(dead, ({ token, sentAt }) =>
    repo.deactivateByToken(token, DateTime.toDate(sentAt))
  )
  yield* Effect.log('Retired dead Expo push tokens', {
    reason,
    reported: Array.length(dead),
    deactivated: Array.length(Array.filter(results, (r) => r)),
  })
})
