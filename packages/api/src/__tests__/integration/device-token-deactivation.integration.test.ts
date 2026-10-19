import {
  DeviceTokenRepository,
  DeviceTokenRepositoryLive,
} from '@lily/api/repositories/device-token.repository'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { ConfigProvider, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'DeviceTokenRepository.deactivateByToken - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let userId: string

    const RepoLive = DeviceTokenRepositoryLive.pipe(
      Layer.provide(DrizzleLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST,
          })
        )
      )
    )

    const deactivate = (token: string, unchangedSince: Date) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* DeviceTokenRepository
          return yield* repo.deactivateByToken(token, unchangedSince)
        }).pipe(Effect.provide(RepoLive))
      )

    const insertToken = async (token: string, updatedAt: Date) => {
      await db
        .insert(schema.deviceTokens)
        .values({ token, platform: 'android', userId, updatedAt })
    }

    const isActive = async (token: string) => {
      const [row] = await db
        .select({ isActive: schema.deviceTokens.isActive })
        .from(schema.deviceTokens)
        .where(eq(schema.deviceTokens.token, token))
      return row?.isActive
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `device-token-deactivation-${Date.now()}@example.com`,
          name: 'Device Token Test User',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      userId = user!.id
    })

    afterAll(async () => {
      await db.execute(sql`DELETE FROM users WHERE id = ${userId}`)
      await pool.end()
    })

    it('deactivates a token unchanged since the push was sent', async () => {
      const token = `ExponentPushToken[stale-${Date.now()}]`
      await insertToken(token, new Date('2026-01-01T00:00:00Z'))

      const deactivated = await deactivate(
        token,
        new Date('2026-01-02T00:00:00Z')
      )

      expect(deactivated).toBe(true)
      expect(await isActive(token)).toBe(false)
    })

    it('keeps a token re-registered after the push was sent', async () => {
      const token = `ExponentPushToken[fresh-${Date.now()}]`
      await insertToken(token, new Date('2026-01-03T00:00:00Z'))

      const deactivated = await deactivate(
        token,
        new Date('2026-01-02T00:00:00Z')
      )

      expect(deactivated).toBe(false)
      expect(await isActive(token)).toBe(true)
    })

    it('reports nothing for an unknown or already inactive token', async () => {
      const token = `ExponentPushToken[twice-${Date.now()}]`
      await insertToken(token, new Date('2026-01-01T00:00:00Z'))
      const sentAt = new Date('2026-01-02T00:00:00Z')

      expect(await deactivate(token, sentAt)).toBe(true)
      expect(await deactivate(token, sentAt)).toBe(false)
      expect(await deactivate('ExponentPushToken[missing]', sentAt)).toBe(false)
    })
  }
)
