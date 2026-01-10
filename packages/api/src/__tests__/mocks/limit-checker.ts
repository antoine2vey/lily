import type { ILimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { LimitExceededError } from '@lily/shared'
import { Effect, Layer } from 'effect'

interface MockLimitCheckerOptions {
  plantLimitReached?: boolean
  aiChatLimitReached?: boolean
  cardScanLimitReached?: boolean
  plantIdentifyLimitReached?: boolean
}

export const createMockLimitChecker = (
  options: MockLimitCheckerOptions = {}
): Layer.Layer<LimitChecker> => {
  const {
    plantLimitReached = false,
    aiChatLimitReached = false,
    cardScanLimitReached = false,
    plantIdentifyLimitReached = false,
  } = options

  const checker: ILimitChecker = {
    checkPlantLimit: () =>
      plantLimitReached
        ? Effect.fail(
            new LimitExceededError({
              feature: 'plants',
              limit: 5,
              current: 5,
              message: 'Plant limit reached',
            })
          )
        : Effect.void,

    checkAiChatLimit: () =>
      aiChatLimitReached
        ? Effect.fail(
            new LimitExceededError({
              feature: 'ai_chats',
              limit: 10,
              current: 10,
              message: 'AI chat limit reached',
            })
          )
        : Effect.void,

    checkCardScanLimit: () =>
      cardScanLimitReached
        ? Effect.fail(
            new LimitExceededError({
              feature: 'card_scans',
              limit: 5,
              current: 5,
              message: 'Card scan limit reached',
            })
          )
        : Effect.void,

    checkPlantIdentifyLimit: () =>
      plantIdentifyLimitReached
        ? Effect.fail(
            new LimitExceededError({
              feature: 'plant_identifies',
              limit: 3,
              current: 3,
              message: 'Plant identify limit reached',
            })
          )
        : Effect.void,
  }

  return Layer.succeed(LimitChecker, checker)
}

// Default mock that allows all operations
export const MockLimitCheckerLive = createMockLimitChecker()
