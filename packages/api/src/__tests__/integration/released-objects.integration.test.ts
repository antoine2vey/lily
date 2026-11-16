import { delivered } from '@lily/api/__tests__/integration/canopy-layers'
import { removeAsCurrentUser } from '@lily/api/__tests__/integration/care-layers'
import { carePermit } from '@lily/api/__tests__/mocks/care'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockFileService } from '@lily/api/__tests__/mocks/file.service'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import {
  createInMemoryGCS,
  mockPublicUrl,
} from '@lily/api/__tests__/mocks/gcs.service'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import type { Absence } from '@lily/api/contexts/absence'
import type { Canopy } from '@lily/api/contexts/canopy'
import {
  type Care,
  CareReadsLive,
  type PlantLife,
} from '@lily/api/contexts/care'
import type { Outbox } from '@lily/api/kernel/outbox'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { ChatRepositoryLive } from '@lily/api/repositories/chat.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { StoredRefRepositoryLive } from '@lily/api/repositories/stored-ref.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { deleteConversation } from '@lily/api/services/ai-chat/endpoints/delete-conversation'
import { deleteCareLog } from '@lily/api/services/care-logs/endpoints/delete-care-log'
import { deletePlantPhoto } from '@lily/api/services/plants/endpoints/delete-plant-photo'
import { updatePlant } from '@lily/api/services/plants/endpoints/update-plant'
import { withPermittedPlant } from '@lily/api/services/plants/helpers/with-plant-access'
import { uploadAvatar } from '@lily/api/services/user/endpoints/upload-avatar'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { BucketRole } from '@lily/shared/services/file/stored-object'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Exit, Layer, References } from 'effect'
import type { PersistedFile } from 'effect/http/Multipart'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const ReposLive = Layer.mergeAll(
  CareReadsLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  ChatRepositoryLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  RoomRepositoryLive,
  StoredRefRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const image = {
  _tag: 'PersistedFile',
  key: 'image',
  name: 'photo.png',
  contentType: 'image/png',
  path: '/tmp/photo.png',
} as unknown as PersistedFile

type App =
  | Layer.Success<typeof ReposLive>
  | Outbox
  | Care
  | PlantLife
  | Canopy
  | Absence
  | Layer.Success<ReturnType<typeof createMockFileService>>
  | Layer.Success<ReturnType<typeof createMockFileSystem>>
  | Layer.Success<ReturnType<typeof createInMemoryGCS>['layer']>
  | Layer.Success<ReturnType<typeof createMockCurrentUser>>

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Released storage objects - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let gcs: ReturnType<typeof createInMemoryGCS>
    let alex: string
    let sam: string

    const as = <A, E>(userId: string, effect: Effect.Effect<A, E, App>) =>
      Effect.runPromiseExit(
        effect.pipe(
          delivered,
          Effect.provide(
            Layer.mergeAll(
              gcs.layer,
              createMockCurrentUser({ id: userId }),
              createMockFileService(),
              createMockFileSystem(),
              createMockEventBus(),
              createMockLimitChecker(),
              createMockMessageQueue(),
              createMockRateLimiterService(),
              createMockWeatherProvider(),
              createMockWeatherCache(),
              createMockWeatherRepository()
            ).pipe(Layer.provideMerge(ReposLive))
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<A, E>
      )

    const done = async <A, E>(
      userId: string,
      effect: Effect.Effect<A, E, App>
    ) => {
      const exit = await as(userId, effect)
      if (Exit.isFailure(exit)) throw new Error(String(exit.cause))
      return exit.value
    }

    const stored = (bucket: BucketRole, ...keys: string[]) =>
      keys.forEach((key) => gcs.objects[bucket].add(key))

    const userNamed = async (name: string, image?: string) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name}-${Date.now()}-${Math.random()}@example.com`,
          name,
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
          image,
        })
        .returning()
      if (!row) throw new Error(`user ${name} insert returned nothing`)
      return row.id
    }

    const plantOf = async (userId: string, imageUrl?: string) => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          userId,
          createdByUserId: userId,
          name: 'Fern',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
          imageUrl,
        })
        .returning()
      if (!row) throw new Error('plant insert returned nothing')
      return row.id
    }

    const photoOf = async (plantId: string, key: string) => {
      const [row] = await db
        .insert(schema.plantPhotos)
        .values({ plantId, url: mockPublicUrl(key) })
        .returning()
      if (!row) throw new Error('photo insert returned nothing')
      return row.id
    }

    const careLogOf = async (plantId: string, key: string) => {
      const [row] = await db
        .insert(schema.careLogs)
        .values({
          plantId,
          type: 'watering',
          careDay: '2026-11-01',
          date: new Date('2026-11-01T09:00:00Z'),
          photoUrl: mockPublicUrl(key),
          performedByUserId: alex,
        })
        .returning()
      if (!row) throw new Error('care log insert returned nothing')
      return row.id
    }

    const conversationOf = async (
      userId: string,
      plantId: string | null,
      imageKeys: string[]
    ) => {
      const [row] = await db
        .insert(schema.chatConversations)
        .values(
          plantId === null
            ? { userId, kind: 'general' }
            : { userId, kind: 'plant', plantId }
        )
        .returning()
      if (!row) throw new Error('conversation insert returned nothing')
      for (const imageKey of imageKeys) {
        await db.insert(schema.chatMessages).values({
          conversationId: row.id,
          userId,
          role: 'user',
          content: 'Look at this leaf',
          imageKey,
        })
      }
      return row.id
    }

    const diagnosisOf = async (
      plantId: string,
      userId: string,
      imageKey: string
    ) => {
      await db.insert(schema.diagnoses).values({
        plantId,
        userId,
        diseaseName: 'Root rot',
        severity: 'MODERATE',
        confidence: 80,
        symptoms: ['yellow leaves'],
        treatmentSteps: ['repot'],
        imageKey,
      })
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      for (const table of [
        'outbox',
        'notifications',
        'diagnoses',
        'chat_messages',
        'chat_conversations',
        'care_logs',
        'plant_photos',
        'plant_care_schedules',
        'plants',
        'users',
      ]) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
      gcs = createInMemoryGCS()
      alex = await userNamed('Alex')
      sam = await userNamed('Sam')
    })

    afterAll(async () => {
      await pool.end()
    })

    describe('removing a plant', () => {
      it('deletes its folder, its older keys and the chat images of every conversation about it', async () => {
        const fern = await plantOf(alex)
        await db
          .update(schema.plants)
          .set({
            imageUrl: mockPublicUrl(`1700000000000-plants/${fern}/a.jpg`),
          })
          .where(eq(schema.plants.id, fern))
        await photoOf(fern, `plants/${fern}/photo.jpg`)
        await photoOf(fern, '1700000000003-photo.jpg')
        await photoOf(fern, `1700000000001-plants/${fern}-1700000000001.jpg`)
        await careLogOf(fern, `1700000000002-plants/${fern}/care.jpg`)
        await conversationOf(alex, fern, [`users/${alex}/chat/c1/leaf.jpg`])
        await conversationOf(sam, fern, [`users/${sam}/chat/c2/leaf.jpg`])
        await diagnosisOf(fern, alex, `users/${alex}/chat/gone/rot.jpg`)
        stored(
          'plant',
          `plants/${fern}/photo.jpg`,
          `plants/${fern}/scan.jpg`,
          `1700000000000-plants/${fern}/a.jpg`,
          `1700000000001-plants/${fern}-1700000000001.jpg`,
          `1700000000002-plants/${fern}/care.jpg`,
          '1700000000003-photo.jpg'
        )
        stored(
          'ai',
          `users/${alex}/chat/c1/leaf.jpg`,
          `users/${sam}/chat/c2/leaf.jpg`,
          `users/${alex}/chat/gone/rot.jpg`
        )

        await done(alex, removeAsCurrentUser(fern))

        expect({
          plant: [...gcs.objects.plant],
          ai: [...gcs.objects.ai],
          conversations: (await db.select().from(schema.chatConversations)).map(
            (row) => row.id
          ),
        }).toEqual({
          plant: ['1700000000003-photo.jpg'],
          ai: [],
          conversations: [],
        })
      })

      it("keeps a chat image that another plant's diagnosis still shows", async () => {
        const fern = await plantOf(alex)
        const monstera = await plantOf(alex)
        const shared = `users/${alex}/chat/c1/leaf.jpg`
        await conversationOf(alex, fern, [shared])
        await diagnosisOf(monstera, alex, shared)
        stored('ai', shared)

        await done(alex, removeAsCurrentUser(fern))

        expect([...gcs.objects.ai]).toEqual([shared])
      })

      it('leaves the objects of another plant that its rows point at', async () => {
        const monstera = await plantOf(sam)
        const fern = await plantOf(
          alex,
          mockPublicUrl(`plants/${monstera}/stolen.jpg`)
        )
        await photoOf(fern, `1700000000000-plants/${monstera}/stolen.jpg`)
        await conversationOf(alex, fern, [`users/${sam}/chat/c9/stolen.jpg`])
        stored(
          'plant',
          `plants/${monstera}/stolen.jpg`,
          `1700000000000-plants/${monstera}/stolen.jpg`
        )
        stored('ai', `users/${sam}/chat/c9/stolen.jpg`)

        await done(alex, removeAsCurrentUser(fern))

        expect({
          plant: [...gcs.objects.plant].sort(),
          ai: [...gcs.objects.ai],
        }).toEqual({
          plant: [
            `1700000000000-plants/${monstera}/stolen.jpg`,
            `plants/${monstera}/stolen.jpg`,
          ],
          ai: [`users/${sam}/chat/c9/stolen.jpg`],
        })
      })

      it('still removes the plant when storage is down', async () => {
        const fern = await plantOf(alex)
        await photoOf(fern, `plants/${fern}/photo.jpg`)
        stored('plant', `plants/${fern}/photo.jpg`)
        gcs.outage.deletes = true

        const exit = await as(alex, removeAsCurrentUser(fern))

        expect({
          succeeded: Exit.isSuccess(exit),
          plants: await db.select().from(schema.plants),
          objects: [...gcs.objects.plant],
        }).toEqual({
          succeeded: true,
          plants: [],
          objects: [`plants/${fern}/photo.jpg`],
        })
      })
    })

    describe('deleting a plant photo', () => {
      it('deletes its object', async () => {
        const fern = await plantOf(alex)
        const photo = await photoOf(fern, `plants/${fern}/photo.jpg`)
        await photoOf(fern, `plants/${fern}/other.jpg`)
        stored('plant', `plants/${fern}/photo.jpg`, `plants/${fern}/other.jpg`)

        await done(alex, deletePlantPhoto({ plantId: fern, photoId: photo }))

        expect([...gcs.objects.plant]).toEqual([`plants/${fern}/other.jpg`])
      })

      it('keeps the object while the plant still shows it as its image', async () => {
        const fern = await plantOf(alex)
        await db
          .update(schema.plants)
          .set({ imageUrl: mockPublicUrl(`plants/${fern}/photo.jpg`) })
          .where(eq(schema.plants.id, fern))
        const photo = await photoOf(fern, `plants/${fern}/photo.jpg`)
        stored('plant', `plants/${fern}/photo.jpg`)

        await done(alex, deletePlantPhoto({ plantId: fern, photoId: photo }))

        expect([...gcs.objects.plant]).toEqual([`plants/${fern}/photo.jpg`])
      })
    })

    describe("replacing a plant's image", () => {
      it('deletes the image it replaced', async () => {
        const fern = await plantOf(alex)
        await db
          .update(schema.plants)
          .set({ imageUrl: mockPublicUrl(`plants/${fern}/old.jpg`) })
          .where(eq(schema.plants.id, fern))
        stored('plant', `plants/${fern}/old.jpg`)

        await done(
          alex,
          withPermittedPlant(fern, 'edit').pipe(
            Effect.flatMap(({ plant, permit }) =>
              updatePlant(plant, permit, { id: fern }, image)
            )
          )
        )

        const [row] = await db
          .select({ imageUrl: schema.plants.imageUrl })
          .from(schema.plants)
          .where(eq(schema.plants.id, fern))
        expect([...gcs.objects.plant].map(mockPublicUrl)).toEqual([
          row?.imageUrl,
        ])
      })
    })

    describe('replacing an avatar', () => {
      it('deletes the avatar it replaced', async () => {
        const kim = await userNamed('Kim')
        await db
          .update(schema.users)
          .set({ image: mockPublicUrl(`users/${kim}/avatars/old.png`) })
          .where(eq(schema.users.id, kim))
        stored('plant', `users/${kim}/avatars/old.png`)

        const { url } = await done(kim, uploadAvatar([image]))

        expect([...gcs.objects.plant].map(mockPublicUrl)).toEqual([url])
      })

      it('deletes an older avatar key that names the user', async () => {
        const kim = await userNamed('Kim')
        const legacy = `1700000000000-avatars/${kim}-1700000000000.png`
        await db
          .update(schema.users)
          .set({ image: mockPublicUrl(legacy) })
          .where(eq(schema.users.id, kim))
        stored('plant', legacy)

        await done(kim, uploadAvatar([image]))

        expect(gcs.objects.plant.has(legacy)).toBe(false)
      })

      it("leaves another user's avatar that the column pointed at", async () => {
        const kim = await userNamed('Kim')
        await db
          .update(schema.users)
          .set({ image: mockPublicUrl(`users/${sam}/avatars/sam.png`) })
          .where(eq(schema.users.id, kim))
        stored('plant', `users/${sam}/avatars/sam.png`)

        await done(kim, uploadAvatar([image]))

        expect(gcs.objects.plant.has(`users/${sam}/avatars/sam.png`)).toBe(true)
      })
    })

    describe('deleting a conversation', () => {
      it('deletes its chat images but keeps one a diagnosis still shows', async () => {
        const fern = await plantOf(alex)
        const leaf = `users/${alex}/chat/c1/leaf.jpg`
        const rot = `users/${alex}/chat/c1/rot.jpg`
        const conversation = await conversationOf(alex, fern, [leaf, rot])
        await diagnosisOf(fern, alex, rot)
        await conversationOf(alex, null, [`users/${alex}/chat/c2/other.jpg`])
        stored('ai', leaf, rot, `users/${alex}/chat/c2/other.jpg`)

        await done(alex, deleteConversation(conversation))

        expect([...gcs.objects.ai].sort()).toEqual([
          rot,
          `users/${alex}/chat/c2/other.jpg`,
        ])
      })

      it('leaves the images of a conversation the caller does not own', async () => {
        const conversation = await conversationOf(sam, null, [
          `users/${sam}/chat/c1/leaf.jpg`,
        ])
        stored('ai', `users/${sam}/chat/c1/leaf.jpg`)

        await done(alex, deleteConversation(conversation))

        expect([...gcs.objects.ai]).toEqual([`users/${sam}/chat/c1/leaf.jpg`])
      })
    })

    describe('deleting a care log', () => {
      it('deletes its photo', async () => {
        const fern = await plantOf(alex)
        const log = await careLogOf(fern, `plants/${fern}/care.jpg`)
        stored('plant', `plants/${fern}/care.jpg`)

        await done(alex, deleteCareLog(carePermit(fern, alex), log))

        expect([...gcs.objects.plant]).toEqual([])
      })
    })
  }
)
