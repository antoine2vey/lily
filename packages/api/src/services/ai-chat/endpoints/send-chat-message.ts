import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { EventBus, publishWithRetry } from '@lily/api/events'
import type { ChatRequest, ChatResponse } from '@lily/shared/ai-chat'
import { Effect } from 'effect'

// TODO: Get real userId from Auth service when auth is integrated
const TEMP_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

// Send chat message
export const sendChatMessage = (
  plantId: string,
  request: ChatRequest
): Effect.Effect<ChatResponse, never, PgDrizzle.PgDrizzle | EventBus> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle
    const eventBus = yield* EventBus
    const userId = TEMP_USER_ID

    // TODO: Implement real AI chat logic
    const response: ChatResponse = {
      message: {
        id: `msg_${crypto.randomUUID()}`,
        role: 'assistant',
        content: `AI response to your message about plant ${plantId}: "${request.message}". This is a fake response for testing.`,
        plantId,
        userId,
        createdAt: new Date(),
      },
      response: 'AI assistant response text',
    }

    yield* publishWithRetry(
      eventBus.publish({
        _tag: 'ChatMessageSent',
        userId,
        plantId,
        messageId: response.message.id,
      })
    )

    return response
  })
