import {
  ChatRepository,
  ChatRepositoryLive,
} from '@lily/api/repositories/chat.repository'
import { PgLive } from '@lily/db'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import * as schema from '@lily/db/schema'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, ConfigProvider, Effect, Layer, ManagedRuntime } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const STORED = 12
const WINDOW = 5

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'chat history window - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let runtime: ManagedRuntime.ManagedRuntime<ChatRepository, unknown>
    let userId: string
    let conversationId: string

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })

      const [user] = await db
        .insert(schema.users)
        .values({
          email: `chat-window-${Date.now()}-${Math.random()}@example.com`,
          name: 'chat-window',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      if (!user) throw new Error('DB insertion failed.')
      userId = user.id

      const [conversation] = await db
        .insert(schema.chatConversations)
        .values({ userId, kind: 'general' })
        .returning()
      if (!conversation) throw new Error('DB insertion failed.')
      conversationId = conversation.id

      const start = Date.parse('2026-01-01T00:00:00Z')
      // Inserted newest first so row order on disk differs from time order.
      await db.insert(schema.chatMessages).values(
        Array.map(Array.reverse(Array.range(1, STORED)), (n) => ({
          role: n % 2 === 0 ? 'assistant' : 'user',
          content: `message ${n}`,
          userId,
          conversationId,
          createdAt: new Date(start + n * 1000),
        }))
      )

      const ConfigLive = ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          DATABASE_URL: process.env.DATABASE_URL_TEST,
        })
      )
      runtime = ManagedRuntime.make(
        ChatRepositoryLive.pipe(
          Layer.provide(
            PgDrizzle.layer.pipe(
              Layer.provideMerge(PgLive.pipe(Layer.provide(ConfigLive)))
            )
          )
        )
      )
    })

    afterAll(async () => {
      await db.delete(schema.users).where(eq(schema.users.id, userId))
      await runtime.dispose()
      await pool.end()
    })

    it('returns only the most recent messages, oldest first', async () => {
      const history = await runtime.runPromise(
        Effect.flatMap(ChatRepository, (repo) =>
          repo.getMessagesAsUIMessages(conversationId, WINDOW)
        )
      )

      expect(
        Array.map(
          history,
          (m) => m.parts[0]?.type === 'text' && m.parts[0].text
        )
      ).toEqual([
        'message 8',
        'message 9',
        'message 10',
        'message 11',
        'message 12',
      ])
    })
  }
)
