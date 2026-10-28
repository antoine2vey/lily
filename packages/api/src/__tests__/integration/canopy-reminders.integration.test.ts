import {
  CanopyRepository,
  CanopyRepositoryLive,
} from '@lily/api/repositories/canopy.repository'
import {
  CareScheduleRepository,
  CareScheduleRepositoryLive,
  type OverdueRecipientPlant,
} from '@lily/api/repositories/care-schedule.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array as Arr,
  Effect,
  Layer,
  Option,
  Order,
  pipe,
  Record,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const RepositoriesLive = Layer.mergeAll(
  CareScheduleRepositoryLive,
  CanopyRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const run = <A, E>(
  effect: Effect.Effect<A, E, CareScheduleRepository | CanopyRepository>
) => Effect.runPromise(effect.pipe(Effect.provide(RepositoriesLive)))

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Canopy reminder queries - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let alex: string
    let lily: string
    let sam: string
    let canopyId: string
    let shared: string
    let mutedPlant: string
    let personal: string

    const user = async (name: string) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name.toLowerCase()}-${Date.now()}@example.com`,
          name: `${name} ${Date.now()}`,
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      return row.id
    }

    const plant = async (
      owner: { userId?: string; canopyId?: string },
      name: string
    ) => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          ...(owner.userId ? { userId: owner.userId } : {}),
          ...(owner.canopyId ? { canopyId: owner.canopyId } : {}),
          createdByUserId: alex,
          name,
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!row) throw new Error(`Failed to create plant ${name}`)
      await db.insert(schema.plantCareSchedules).values({
        plantId: row.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: new Date(Date.now() - 2 * 86_400_000),
      })
      return row.id
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      for (const table of [
        'notifications',
        'plant_care_schedules',
        'plants',
        'canopy_plant_mutes',
        'canopy_members',
        'canopies',
        'users',
      ]) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
      alex = await user('Alex')
      lily = await user('Lily')
      sam = await user('Sam')
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Flat', timezone: 'UTC' })
        .returning()
      if (!canopy) throw new Error('Failed to create canopy')
      canopyId = canopy.id
      await db.insert(schema.canopyMembers).values([
        { canopyId, userId: alex, role: 'owner' },
        { canopyId, userId: lily, role: 'member' },
      ])
      shared = await plant({ canopyId }, 'Shared Fern')
      mutedPlant = await plant({ canopyId }, 'Muted Cactus')
      personal = await plant({ userId: alex }, 'Alex Pothos')
      await db
        .insert(schema.canopyPlantMutes)
        .values({ userId: lily, plantId: mutedPlant })
    })

    afterAll(async () => {
      await pool.end()
    })

    it('addresses an overdue Canopy plant to each unmuted member with the Canopy as owner', async () => {
      const grouped = await run(
        Effect.flatMap(CareScheduleRepository, (repo) =>
          repo.findOverdueByUser()
        )
      )
      const plantsOf = (id: string) =>
        pipe(
          Record.get(grouped, id),
          Option.getOrElse((): ReadonlyArray<OverdueRecipientPlant> => [])
        )
      const forUser = (id: string) =>
        pipe(
          plantsOf(id),
          Arr.map((p) => [p.name, p.owner._tag] as const),
          Arr.sort(
            Order.mapInput(
              Order.String,
              (entry: readonly [string, string]) => entry[0]
            )
          )
        )

      expect(forUser(alex)).toEqual([
        ['Alex Pothos', 'User'],
        ['Muted Cactus', 'Canopy'],
        ['Shared Fern', 'Canopy'],
      ])
      expect(forUser(lily)).toEqual([['Shared Fern', 'Canopy']])
      expect(forUser(sam)).toEqual([])
      const canopyOwner = pipe(
        plantsOf(alex),
        Arr.findFirst((p) => p.id === shared),
        Option.map((p) => p.owner),
        Option.getOrNull
      )
      expect(canopyOwner).toEqual({ _tag: 'Canopy', canopyId })
    })

    it('lists unmuted Canopy plants in the member care tasks only when asked', async () => {
      const cutoff = new Date(Date.now() + 86_400_000)
      const [without, withCanopy] = await run(
        Effect.flatMap(CareScheduleRepository, (repo) =>
          Effect.all([
            repo.findPendingByUser(lily, cutoff, false),
            repo.findPendingByUser(lily, cutoff, true),
          ])
        )
      )
      expect(without).toEqual([])
      expect(Arr.map(withCanopy, (s) => s.plant.id)).toEqual([shared])
    })

    it('includes unmuted Canopy schedules with the Canopy owner in findByOwnerWithPlant', async () => {
      const rows = await run(
        Effect.flatMap(CareScheduleRepository, (repo) =>
          repo.findByOwnerWithPlant(lily)
        )
      )
      expect(Arr.map(rows, (r) => [r.plant.id, r.plant.owner._tag])).toEqual([
        [shared, 'Canopy'],
      ])
    })

    it('lists reminder recipients minus the member who muted the plant', async () => {
      const [forShared, forMuted] = await run(
        Effect.flatMap(CanopyRepository, (repo) =>
          Effect.all([
            repo.findReminderRecipients(canopyId, shared),
            repo.findReminderRecipients(canopyId, mutedPlant),
          ])
        )
      )
      expect([...forShared].sort()).toEqual([alex, lily].sort())
      expect(forMuted).toEqual([alex])
    })
  }
)
