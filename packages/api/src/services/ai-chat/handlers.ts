import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { getChatHistory } from '@lily/api/services/ai-chat/endpoints/get-chat-history'
import { streamChatMessage } from '@lily/api/services/ai-chat/endpoints/stream-chat-message'
import { uploadChatImage } from '@lily/api/services/ai-chat/endpoints/upload-chat-image'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { parsePaginationParams } from '@lily/shared'

export const AIChatApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'aiChat', (handlers) =>
    handlers
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
      .handle('uploadChatImage', ({ path: { plantId }, payload: { files } }) =>
        uploadChatImage({ plantId, files }).pipe(withInfraErrorsAsDefect)
      )
      .handle('getChatHistory', ({ path: { plantId }, urlParams }) =>
        getChatHistory({
          plantId,
          ...parsePaginationParams(urlParams),
        }).pipe(withInfraErrorsAsDefect)
      )
  )
