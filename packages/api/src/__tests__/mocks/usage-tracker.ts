import type { IUsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import { UsageTracker } from '@lily/api/services/subscriptions/usage-tracker'
import { Effect, Layer } from 'effect'

export const createMockUsageTracker = (): Layer.Layer<UsageTracker> => {
  const tracker: IUsageTracker = {
    trackAiChat: () => Effect.succeed(null),
    trackCardScan: () => Effect.succeed(null),
    trackPlantIdentify: () => Effect.succeed(null),
  }

  return Layer.succeed(UsageTracker, tracker)
}

// Default mock for tests
export const MockUsageTrackerLive = createMockUsageTracker()
