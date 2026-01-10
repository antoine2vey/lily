import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { RedisEventBusLive } from '@lily/api/events'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { ChatRepositoryLive } from '@lily/api/repositories/chat.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { AIChatService } from '@lily/api/services/ai-chat/service'
import { AuthenticationLive } from '@lily/api/services/auth/middleware'
import { RedisClientLive } from '@lily/api/services/message-queue/redis.provider'
import { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
import { UsageTrackerLive } from '@lily/api/services/subscriptions/usage-tracker'
import { AiService } from '@lily/shared/services/ai/service'
import { Effect, Layer } from 'effect'

// Implement the AI Chat API group
export const AIChatApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'aiChat', (handlers) =>
    Effect.gen(function* () {
      const aiChatService = yield* AIChatService

      return handlers
        .handle('sendChatMessage', ({ path: { plantId }, payload }) =>
          aiChatService.sendChatMessage(plantId, payload)
        )
        .handle('getChatHistory', ({ path: { plantId }, urlParams }) =>
          aiChatService.getChatHistory({
            plantId,
            page: parseInt(urlParams.page, 10) || 1,
            limit: parseInt(urlParams.limit, 10) || 20,
          })
        )
    })
  ).pipe(
    Layer.provide(AIChatService.Default),
    Layer.provide(ChatRepositoryLive),
    Layer.provide(AiService.Default),
    Layer.provide(RedisEventBusLive),
    Layer.provide(RedisClientLive),
    Layer.provide(AuthenticationLive),
    Layer.provide(LimitCheckerLive),
    Layer.provide(UsageTrackerLive),
    Layer.provide(SubscriptionRepositoryLive),
    Layer.provide(AchievementRepositoryLive)
  )
