import { delivered } from '@lily/api/__tests__/integration/canopy-layers'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createInMemoryGCS } from '@lily/api/__tests__/mocks/gcs.service'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CareReadsLive } from '@lily/api/contexts/care'
import { ReminderStoreLive } from '@lily/api/contexts/reminders'
import { AccountPhotoRepositoryLive } from '@lily/api/repositories/account-photo.repository'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { NotificationDeliveryLive } from '@lily/api/repositories/notification-delivery.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { GCSService } from '@lily/api/services/file/gcs'
import { purgeAccount } from '@lily/api/services/user/helpers/purge-account'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Cause,
  ConfigProvider,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  References,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const IDLE_IN_TRANSACTION_TIMEOUT = '1 second'
const STORAGE_DELAY = '3 seconds'

const BaseLive = Layer.mergeAll(
  AccountPhotoRepositoryLive,
  PlantRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  NotificationRepositoryLive,
  ReminderStoreLive,
  NotificationDeliveryLive,
  UserRepositoryLive,
  CarePlanRepositoryLive,
  CanopyRepositoryLive,
  DelegationRepositoryLive,
  RoomRepositoryLive,
  DeviceTokenRepositoryLive,
  ActivityPushTokenRepositoryLive,
  SubscriptionRepositoryLive
).pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(
    PgLive.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
            DATABASE_IDLE_IN_TRANSACTION_TIMEOUT: IDLE_IN_TRANSACTION_TIMEOUT,
          })
        )
      )
    )
  )
)

const outcome = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => 'ok',
    onFailure: (cause) =>
      (Cause.squash(cause) as { readonly _tag?: string })._tag ?? 'failed',
  })

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Purging an account while storage is slow - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof BaseLive>,
      Layer.Error<typeof BaseLive>
    >
    let gcs: ReturnType<typeof createInMemoryGCS>

    const slowGcs = () =>
      Layer.effect(
        GCSService,
        Effect.map(GCSService, (service) => ({
          ...service,
          deleteScope: (scope: Parameters<typeof service.deleteScope>[0]) =>
            Effect.andThen(
              Effect.sleep(STORAGE_DELAY),
              service.deleteScope(scope)
            ),
        }))
      ).pipe(Layer.provide(gcs.layer))

    const purge = (userId: string) =>
      runtime.runPromiseExit(
        delivered(purgeAccount(userId)).pipe(
          Effect.provide(
            Layer.mergeAll(
              slowGcs(),
              createMockCurrentUser({ id: userId, name: userId }),
              createMockEventBus(),
              createMockLimitChecker(),
              createMockMessageQueue(),
              MockAlerterLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<unknown, unknown, Layer.Success<typeof BaseLive>>
      )

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      runtime = ManagedRuntime.make(BaseLive)
    })

    beforeEach(async () => {
      gcs = createInMemoryGCS()
      for (const table of [
        'outbox',
        'notifications',
        'canopy_members',
        'plants',
        'canopies',
        'users',
      ]) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    it('finishes when storage takes longer than the idle-in-transaction timeout of the pool', async () => {
      const [alex] = await db
        .insert(schema.users)
        .values({
          email: `alex-${Date.now()}@example.com`,
          name: 'alex',
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      if (!alex) throw new Error('Failed to create alex')
      gcs.objects.plant.add(`users/${alex.id}/avatars/a.png`)

      const purged = await purge(alex.id)

      expect(outcome(purged)).toBe('ok')
      expect([...gcs.objects.plant]).toEqual([])
      expect(await db.select().from(schema.users)).toEqual([])
    }, 30000)
  }
)
