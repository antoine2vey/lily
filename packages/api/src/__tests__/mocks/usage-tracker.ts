import type {
  IUsageTracker,
  UsageReservation,
} from '@lily/api/services/subscriptions/usage-tracker'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import { LimitExceededError, type UsageField } from '@lily/shared'
import { Effect, Exit, Layer, Match, pipe } from 'effect'

interface MockUsageTrackerOptions {
  limitReached?: boolean | undefined
  onReserve?: ((userId: string, field: UsageField) => void) | undefined
  onRelease?: ((userId: string, field: UsageField) => void) | undefined
}

const featureOf = (field: UsageField) =>
  pipe(
    Match.value(field),
    Match.when('aiChats', () => 'ai_chats' as const),
    Match.when('cardScans', () => 'card_scans' as const),
    Match.when('plantIdentifies', () => 'plant_identifies' as const),
    Match.exhaustive
  )

export const createMockUsageTracker = (
  options: MockUsageTrackerOptions = {}
): Layer.Layer<UsageTracker> => {
  const reserve: IUsageTracker['reserve'] = (userId, field) => {
    if (options.limitReached) {
      return Effect.fail(
        new LimitExceededError({
          feature: featureOf(field),
          limit: 1,
          current: 1,
          message: `${field} limit reached`,
        })
      )
    }
    options.onReserve?.(userId, field)
    const reservation: UsageReservation = {
      usage: {
        id: 'usage-1',
        userId,
        periodStart: new Date(),
        periodEnd: new Date(),
        aiChatsCount: 0,
        cardScansCount: 0,
        plantIdentifiesCount: 0,
      },
      release: Effect.sync(() => options.onRelease?.(userId, field)),
    }
    return Effect.succeed(reservation)
  }

  const tracker: IUsageTracker = {
    reserve,
    withReservation: (userId, field, body) =>
      Effect.acquireUseRelease(
        reserve(userId, field),
        () => body,
        (reservation, exit) =>
          Exit.isSuccess(exit) ? Effect.void : reservation.release
      ),
  }

  return Layer.succeed(UsageTracker, tracker)
}

// Default mock for tests
export const MockUsageTrackerLive = createMockUsageTracker()
