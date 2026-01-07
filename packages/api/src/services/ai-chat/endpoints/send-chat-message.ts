import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import type { ChatRequest, ChatResponse } from '@lily/shared/ai-chat'
import { Effect } from 'effect'

// Send chat message
export const sendChatMessage = (
  plantId: string,
  request: ChatRequest
): Effect.Effect<ChatResponse, never, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle

    // Return fake chat response
    return {
      message: {
        id: 'msg_123',
        role: 'assistant',
        content: `AI response to your message about plant ${plantId}: "${request.message}". This is a fake response for testing.`,
        plantId,
        userId: 'user_123',
        createdAt: new Date(),
      },
      response: 'AI assistant response text',
    }
  })
