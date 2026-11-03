import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { createMockAlerter } from '@lily/api/__tests__/mocks/alerter'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createSuccessPushService } from '@lily/api/__tests__/mocks/push.service'
import { createInMemoryRedisQueue } from '@lily/api/__tests__/mocks/redis-queue'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { DeadLetterRepositoryLive } from '@lily/api/repositories/dead-letter.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { consumeFromTopic } from '@lily/api/services/notification-scheduler/worker'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { MessageQueue } from '@lily/shared/server'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { ConfigProvider, Effect, Layer, References } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Poison queue entries - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>

    const RepositoriesLive = Layer.mergeAll(
      NotificationRepositoryLive,
      DeadLetterRepositoryLive
    ).pipe(
      Layer.provide(DrizzleLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST,
          })
        )
      )
    )

    beforeAll(() => {
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE dead_letter_messages`)
    })

    afterAll(async () => {
      await pool.end()
    })

    it.each([
      ['a JSON null', 'null', 'null'],
      [
        'an object holding an escaped NUL',
        '{"id":"msg-nul","note":"a\\u0000b"}',
        '{"id":"msg-nul","note":"a\\u0000b"}',
      ],
      ['text holding a NUL character', 'not json \u0000', 'not json \\u0000'],
    ])(
      'stores %s in the dead letter table, acks it and alerts once',
      async (_, raw, storedPayload) => {
        const { queue, acked } = createInMemoryRedisQueue([raw])
        const alerter = createMockAlerter()

        await Effect.runPromise(
          consumeFromTopic('new_follower').pipe(
            Effect.provide(
              Layer.mergeAll(
                RepositoriesLive,
                alerter.layer,
                Layer.succeed(MessageQueue, queue),
                createSuccessPushService(),
                createMockDeviceTokenRepository([]),
                createMockActivityPushTokenRepository(),
                createMockCareScheduleRepository(),
                createMockCareLogRepository([]),
                createMockUserRepository([]),
                createMockDelegationRepository(),
                createMockCanopyRepository([]),
                createMockPlantRepository({ plants: [] })
              )
            ),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )

        const stored = await db.execute(
          sql`SELECT jsonb_typeof(payload) AS type, payload #>> '{}' AS text FROM dead_letter_messages`
        )
        expect(stored.rows).toEqual([{ type: 'string', text: storedPayload }])
        expect(acked).toEqual([raw])
        expect(alerter.events).toHaveLength(1)
      }
    )
  }
)
