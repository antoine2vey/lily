import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { Session } from '@lily/api/services/auth/session'
import type { ChatRequest, ChatResponse } from '@lily/shared/ai-chat'
import type { SessionNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'

export const sendChatMessage = (
  plantId: string,
  request: ChatRequest
): Effect.Effect<
  ChatResponse,
  SessionNotFoundError,
  PgDrizzle.PgDrizzle | EventBus | Session
> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle
    const eventBus = yield* EventBus
    const { userId } = yield* Session

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
