import { eachIsolated } from '@lily/api/kernel/each-isolated'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { nowAsDate } from '@lily/shared'
import { DateTime, Duration, Effect } from 'effect'

/**
 * How long a reservation may stay `reserved` before the sweep refunds it.
 * The work a unit meters is bounded: a chat turn by `streamCompletionTimeout`
 * (3 minutes, `stream-chat-message.ts`), a scan or an identify by a few
 * vision calls of `OPENAI_TIMEOUTS.vision` (30 seconds each). Five times the
 * longest leaves the saves around the work their margin, so a reservation
 * this old belongs to a process that died or to a refund that failed.
 */
export const RESERVATION_MAX_AGE = Duration.minutes(15)

/**
 * Refunds every reservation left `reserved` for longer than
 * `RESERVATION_MAX_AGE`, then deletes the settled reservations of closed
 * months. A refund is a conditional move, so a turn that outlived the bound
 * and charges late finds its reservation already refunded.
 */
export const sweepUsageReservations = Effect.gen(function* () {
  const subRepo = yield* SubscriptionRepository

  const stale = yield* subRepo.findReservedBefore(
    DateTime.toDateUtc(
      DateTime.subtractDuration(DateTime.nowUnsafe(), RESERVATION_MAX_AGE)
    )
  )
  const refunds = yield* eachIsolated(
    'usage-reservation-sweep',
    stale,
    (reservationId) => reservationId,
    subRepo.releaseUsage
  )
  const deleted = yield* subRepo.deleteSettledReservations(nowAsDate())

  if (refunds.due + deleted > 0) {
    yield* Effect.log('[usage-reservation-sweep] Swept', {
      stale: refunds.due,
      refunded: refunds.advanced,
      failed: refunds.failed,
      deleted,
    })
  }
}).pipe(Effect.withSpan('usage-reservation-sweep.sweep'))

export const startUsageReservationSweep = createScheduler({
  name: 'usage-reservation-sweep',
  interval: '5 minutes',
  runOnStartup: true,
  task: sweepUsageReservations,
})
