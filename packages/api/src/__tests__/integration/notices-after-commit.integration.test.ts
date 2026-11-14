import { settled } from '@lily/api/__tests__/integration/canopy-layers'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { Absence } from '@lily/api/contexts/absence'
import { Canopy } from '@lily/api/contexts/canopy'
import { CareReadsLive } from '@lily/api/contexts/care'
import { transact } from '@lily/api/kernel/transact'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { MessageQueue } from '@lily/shared/server'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Data, Effect, Layer, ManagedRuntime, References, Struct } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const DAY = 86_400_000

const BaseLive = Layer.mergeAll(
  CanopyRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  UserRepositoryLive,
  createMockEventBus(),
  createMockWeatherProvider(),
  createMockWeatherCache(),
  createMockWeatherRepository(),
  createMockLimitChecker()
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

class CallerFailed extends Data.TaggedError('CallerFailed') {}

interface Enqueued {
  readonly topic: string
  readonly rowSeenByTheWorker: boolean
}

interface Owing {
  readonly command: Effect.Effect<unknown, unknown, unknown>
  readonly topic: string
}

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'A command that owes notifications, inside a transaction of its caller - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof BaseLive>,
      Layer.Error<typeof BaseLive>
    >
    let enqueued: Enqueued[]

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      runtime = ManagedRuntime.make(BaseLive)
    })

    beforeEach(async () => {
      await db.execute(sql`TRUNCATE TABLE canopies RESTART IDENTITY CASCADE`)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
      enqueued = []
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    const queueOfAnotherSession = Layer.effect(
      MessageQueue,
      Effect.map(MessageQueue, (queue) =>
        MessageQueue.of({
          ...queue,
          enqueue: (message) =>
            Effect.promise(async () => {
              const { rowCount } = await pool.query(
                'SELECT 1 FROM notifications WHERE id = ANY($1::uuid[])',
                [message.payload.notificationIds]
              )
              enqueued.push({
                topic: message.topic,
                rowSeenByTheWorker: rowCount === 1,
              })
            }),
        })
      )
    ).pipe(Layer.provide(createMockMessageQueue()))

    const inATransactionOfTheCaller = (
      command: Effect.Effect<unknown, unknown, unknown>,
      thenTheCaller: Effect.Effect<void, unknown>
    ) =>
      runtime.runPromiseExit(
        transact(Effect.andThen(command, thenTheCaller)).pipe(
          settled,
          Effect.provide(queueOfAnotherSession),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<void, unknown, Layer.Success<typeof BaseLive>>
      )

    const aUser = async () => {
      const tag = `user-${crypto.randomUUID()}`
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `${tag}@example.com`,
          name: tag,
          emailVerified: true,
          timezone: 'UTC',
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      return user.id
    }

    const aCanopyOf = async (...members: ReadonlyArray<string>) => {
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Home', timezone: 'UTC' })
        .returning()
      if (!canopy) throw new Error('canopy insert returned nothing')
      await db.insert(schema.canopyMembers).values(
        members.map((userId, index) => ({
          canopyId: canopy.id,
          userId,
          role: index === 0 ? ('owner' as const) : ('member' as const),
        }))
      )
    }

    const notificationRows = async () => {
      const { rowCount } = await pool.query('SELECT 1 FROM notifications')
      return rowCount
    }

    const COMMANDS = {
      'Canopy.invite': async () => {
        const owner = await aUser()
        const invitee = await aUser()
        await aCanopyOf(owner)
        return {
          command: Effect.flatMap(Canopy, (canopy) =>
            canopy.invite({ by: owner, invitee })
          ),
          topic: 'canopy_invitation',
        }
      },
      'Canopy.leaveForDeletion': async () => {
        const owner = await aUser()
        const leaver = await aUser()
        await aCanopyOf(owner, leaver)
        return {
          command: Effect.flatMap(Canopy, (canopy) =>
            canopy.leaveForDeletion(leaver)(Effect.void)
          ),
          topic: 'canopy_member_left',
        }
      },
      'Absence.respondToDelegation': async () => {
        const owner = await aUser()
        const caretaker = await aUser()
        const [delegation] = await db
          .insert(schema.careDelegations)
          .values({
            ownerId: owner,
            caretakerId: caretaker,
            status: 'pending',
            startDate: new Date(Date.now() + DAY),
            endDate: new Date(Date.now() + 8 * DAY),
          })
          .returning()
        if (!delegation) throw new Error('delegation insert returned nothing')
        return {
          command: Effect.flatMap(Absence, (absence) =>
            absence.respondToDelegation({
              by: caretaker,
              delegationId: delegation.id,
              accept: true,
            })
          ),
          topic: 'delegation_accepted',
        }
      },
    } satisfies Record<string, () => Promise<Owing>>

    it.each(Struct.keys(COMMANDS))(
      '%s enqueues its notification once the caller has committed the row',
      async (name) => {
        const { command, topic }: Owing = await COMMANDS[name]()

        await inATransactionOfTheCaller(command, Effect.void)

        expect(enqueued).toEqual([{ topic, rowSeenByTheWorker: true }])
      }
    )

    it.each(Struct.keys(COMMANDS))(
      '%s enqueues nothing when the caller rolls back',
      async (name) => {
        const { command }: Owing = await COMMANDS[name]()

        await inATransactionOfTheCaller(command, new CallerFailed())

        expect({ enqueued, rows: await notificationRows() }).toEqual({
          enqueued: [],
          rows: 0,
        })
      }
    )
  }
)
