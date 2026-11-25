import { CanopyOnPostgresLive } from '@lily/api/__tests__/integration/canopy-layers'
import { sessionsWaitingForALock } from '@lily/api/__tests__/integration/lock-waits'
import { NoStoredPhotosLive } from '@lily/api/__tests__/mocks/account-photo.repository'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { mockAdminProfile } from '@lily/api/__tests__/mocks/auth'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CareReadsLive } from '@lily/api/contexts/care'
import { ReminderStoreLive } from '@lily/api/contexts/reminders'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DeadLetterRepositoryLive } from '@lily/api/repositories/dead-letter.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { NotificationDeliveryLive } from '@lily/api/repositories/notification-delivery.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AdminApi } from '@lily/api/services/admin/api'
import { deleteUser } from '@lily/api/services/admin/endpoints/delete-user'
import { AdminAuth, AdminUser } from '@lily/api/services/admin/middleware.types'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, FileSystem, Layer, Path, Redacted, String } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder, HttpApiGroup } from 'effect/http-api'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ReposLive = Layer.mergeAll(
  ActivityPushTokenRepositoryLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CarePlanRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DeadLetterRepositoryLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  NotificationRepositoryLive,
  NotificationDeliveryLive,
  ReminderStoreLive,
  PlantRepositoryLive,
  RefreshTokenRepositoryLive,
  RoomRepositoryLive,
  SubscriptionRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const PurgeLive = CanopyOnPostgresLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      ReposLive,
      NoStoredPhotosLive,
      createMockEventBus(),
      createMockLimitChecker(),
      createMockMessageQueue(),
      createMockPushService(),
      MockAlerterLive,
      createMockWeatherProvider(),
      createMockWeatherCache(),
      createMockWeatherRepository()
    )
  )
)

const AdminDeleteApi = HttpApi.make('Api').add(
  HttpApiGroup.make('admin').add(AdminApi.endpoints.deleteUser)
)

const AdminDeleteLive = HttpApiBuilder.group(
  AdminDeleteApi,
  'admin',
  (handlers) =>
    handlers.handle('deleteUser', ({ params: { id } }) =>
      deleteUser(id).pipe(withInfraErrorsAsDefect)
    )
)

const AdminAuthLive = Layer.succeed(
  AdminAuth,
  AdminAuth.of({
    bearer: (httpEffect, { credential }) =>
      Effect.provideService(httpEffect, AdminUser, {
        ...mockAdminProfile,
        id: Redacted.value(credential),
      }),
  })
)

const PlatformLive = Layer.mergeAll(
  Path.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'An admin user id sent in upper case - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let web: {
      readonly handler: (request: Request) => Promise<Response>
      readonly dispose: () => Promise<void>
    }

    const user = async (name: string) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name}-${crypto.randomUUID()}@example.com`,
          name: `${name}_${crypto.randomUUID()}`,
          emailVerified: true,
        })
        .returning()
      if (!row) throw new Error('user insert returned nothing')
      return row.id
    }

    const exists = async (userId: string) =>
      (
        await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
      ).length === 1

    const deleteAs = async (adminId: string, id: string) => {
      const response = await web.handler(
        new Request(`http://lily.test/admin/users/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminId}` },
        })
      )
      const body: { readonly _tag?: string } = await response.json()
      return { status: response.status, tag: body._tag }
    }

    beforeAll(() => {
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      web = HttpRouter.toWebHandler(
        HttpApiBuilder.layer(AdminDeleteApi).pipe(
          Layer.provide(AdminDeleteLive),
          Layer.provide(AdminAuthLive),
          HttpRouter.provideRequest(PurgeLive),
          Layer.provide(PlatformLive)
        ),
        { disableLogger: true }
      )
    })

    afterAll(async () => {
      await web.dispose()
      await pool.end()
    })

    it('purges the account under the lock its lowercase id takes', async () => {
      const admin = await user('admin')
      const target = await user('sam')
      const holder = await pool.connect()
      try {
        await holder.query('BEGIN')
        await holder.query('SELECT pg_advisory_xact_lock(1, hashtext($1))', [
          target,
        ])
        const deleting = deleteAs(admin, String.toUpperCase(target))
        const waited = await sessionsWaitingForALock(pool, 1)
        await holder.query('COMMIT')
        const answer = await deleting

        expect([waited, answer.status, await exists(target)]).toEqual([
          1,
          200,
          false,
        ])
      } finally {
        holder.release()
      }
    })

    it('refuses an admin who names their own account in upper case', async () => {
      const admin = await user('admin')

      const answer = await deleteAs(admin, String.toUpperCase(admin))

      expect([answer.tag, await exists(admin)]).toEqual([
        'CannotModifySelfError',
        true,
      ])
    })
  }
)
