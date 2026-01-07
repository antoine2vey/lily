import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import type { ChatMessage } from '@lily/shared/ai-chat'
import { Effect } from 'effect'

// Get chat history
export const getChatHistory = (
  plantId: string
): Effect.Effect<ChatMessage[], never, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle

    // Return fake chat history
    return [
      {
        id: 'msg_1',
        role: 'user',
        content: 'How often should I water this plant?',
        plantId,
        userId: 'user_123',
        createdAt: new Date('2024-01-15T10:00:00Z'),
      },
      {
        id: 'msg_2',
        role: 'assistant',
        content:
          'Based on your plant type, I recommend watering every 3-4 days. Check the soil moisture first!',
        plantId,
        userId: 'user_123',
        createdAt: new Date('2024-01-15T10:01:00Z'),
      },
    ]
  })
