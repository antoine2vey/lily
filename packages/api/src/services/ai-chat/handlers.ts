import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { RedisEventBusLive } from '@lily/api/events'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { ChatRepositoryLive } from '@lily/api/repositories/chat.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DiagnosisRepositoryLive } from '@lily/api/repositories/diagnosis.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { ProcessedChunkRepositoryLive } from '@lily/api/repositories/processed-chunk.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { AiService } from '@lily/api/services/ai/service'
import { streamChatMessage } from '@lily/api/services/ai-chat/endpoints/stream-chat-message'
import { uploadChatImage } from '@lily/api/services/ai-chat/endpoints/upload-chat-image'
import { AIChatService } from '@lily/api/services/ai-chat/service'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { RedisClientLive } from '@lily/api/services/message-queue/redis.provider'
import { RagService } from '@lily/api/services/rag/service'
import { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
import { UsageTrackerLive } from '@lily/api/services/subscriptions/usage-tracker'
import { KnowledgeDrizzleLive } from '@lily/knowledge-db'
import { FileService } from '@lily/shared/services/file/fileservice'
import { GCSService } from '@lily/shared/services/file/gcs'
import { Effect, Layer } from 'effect'

// Implement the AI Chat API group
export const AIChatApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'aiChat', (handlers) =>
    Effect.gen(function* () {
      const aiChatService = yield* AIChatService

      return handlers
        .handle('streamChatMessage', ({ path: { plantId }, payload }) =>
          streamChatMessage(plantId, {
            message: payload.message,
            ...(payload.imageUrl !== undefined
              ? { imageUrl: payload.imageUrl }
              : {}),
            ...(payload.imageKey !== undefined
              ? { imageKey: payload.imageKey }
              : {}),
          }).pipe(withInfraErrorsAsDefect)
        )
        .handle(
          'uploadChatImage',
          ({ path: { plantId }, payload: { files } }) =>
            uploadChatImage({ plantId, files }).pipe(withInfraErrorsAsDefect)
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
    Layer.provide(AchievementRepositoryLive),
    Layer.provide(PlantRepositoryLive),
    Layer.provide(CareScheduleRepositoryLive),
    Layer.provide(DelegationRepositoryLive),
    Layer.provide(CareLogRepositoryLive),
    Layer.provide(DiagnosisRepositoryLive),
    Layer.provide(GCSService.Default),
    Layer.provide(FileService.Default),
    Layer.provide(RagService.Default),
    Layer.provide(ProcessedChunkRepositoryLive),
    Layer.provide(KnowledgeDrizzleLive)
  )
