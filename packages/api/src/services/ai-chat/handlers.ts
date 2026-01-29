import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { RedisEventBusLive } from '@lily/api/events'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { ChatRepositoryLive } from '@lily/api/repositories/chat.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { AiService } from '@lily/api/services/ai/service'
import { streamChatMessage } from '@lily/api/services/ai-chat/endpoints/stream-chat-message'
import { AIChatService } from '@lily/api/services/ai-chat/service'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { RedisClientLive } from '@lily/api/services/message-queue/redis.provider'
import { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
import { UsageTrackerLive } from '@lily/api/services/subscriptions/usage-tracker'
import { Effect, Layer } from 'effect'

// Implement the AI Chat API group
export const AIChatApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'aiChat', (handlers) =>
    Effect.gen(function* () {
      const aiChatService = yield* AIChatService

      return handlers
        .handle('sendChatMessage', ({ path: { plantId }, payload }) =>
          aiChatService
            .sendChatMessage(plantId, payload)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('streamChatMessage', ({ path: { plantId }, payload }) =>
          streamChatMessage(plantId, { message: payload.message }).pipe(
            withInfraErrorsAsDefect
          )
        )
        .handle('getChatHistory', ({ path: { plantId }, urlParams }) =>
          aiChatService
            .getChatHistory({
              plantId,
              page: parseInt(urlParams.page, 10) || 1,
              limit: parseInt(urlParams.limit, 10) || 20,
            })
            .pipe(withInfraErrorsAsDefect)
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
