import { Effect } from 'effect'
import { getChatHistory } from './endpoints/get-chat-history'
import { sendChatMessage } from './endpoints/send-chat-message'

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
