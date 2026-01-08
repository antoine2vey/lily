import { getChatHistory } from '@lily/api/services/ai-chat/endpoints/get-chat-history'
import { sendChatMessage } from '@lily/api/services/ai-chat/endpoints/send-chat-message'
import { Effect } from 'effect'

// AI Chat service implementation
export class AIChatService extends Effect.Service<AIChatService>()(
  'AIChatService',
  {
    effect: Effect.succeed({
      sendChatMessage,
      getChatHistory,
    }),
  }
) {}
