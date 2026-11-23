import { delivered } from '@lily/api/__tests__/integration/canopy-layers'
import { removeAsCurrentUser } from '@lily/api/__tests__/integration/care-layers'
import {
  carePermit,
  chatPermit,
  permitTo,
} from '@lily/api/__tests__/mocks/care'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockFileService } from '@lily/api/__tests__/mocks/file.service'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import {
  createInMemoryGCS,
  MOCK_BUCKET_NAMES,
  mockPublicUrl,
} from '@lily/api/__tests__/mocks/gcs.service'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import type { Absence } from '@lily/api/contexts/absence'
import type { Canopy } from '@lily/api/contexts/canopy'
import {
  type Care,
  type CarePlans,
  CareReadsLive,
  type PlantLife,
} from '@lily/api/contexts/care'
import type { Outbox } from '@lily/api/kernel/outbox'
import { transactQuietly } from '@lily/api/kernel/transact'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { ChatRepositoryLive } from '@lily/api/repositories/chat.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import {
  DiagnosisRepository,
  DiagnosisRepositoryLive,
} from '@lily/api/repositories/diagnosis.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import {
  StoredRefRepository,
  StoredRefRepositoryLive,
} from '@lily/api/repositories/stored-ref.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { deleteConversation } from '@lily/api/services/ai-chat/endpoints/delete-conversation'
import type { ToolContext } from '@lily/api/services/ai-chat/tools'
import { createDiagnosisTool } from '@lily/api/services/ai-chat/tools/create-diagnosis'
import { deleteCareLog } from '@lily/api/services/care-logs/endpoints/delete-care-log'
import { deletePlantPhoto } from '@lily/api/services/plants/endpoints/delete-plant-photo'
import { updatePlant } from '@lily/api/services/plants/endpoints/update-plant'
import { withPermittedPlant } from '@lily/api/services/plants/helpers/with-plant-access'
import { uploadAvatar } from '@lily/api/services/user/endpoints/upload-avatar'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import {
  type BucketRole,
  namedObjects,
} from '@lily/shared/services/file/stored-object'
import { failureOf } from '@lily/shared/testing'
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
  DiagnosisRepositoryLive,
  NotificationRepositoryLive,
  PlantRepositoryLive,
  RoomRepositoryLive,
  StoredRefRepositoryLive,
  UserRepositoryLive,
  createMockRagService()
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
  | CarePlans
  | PlantLife
  | Canopy
  | Absence
  | Layer.Success<typeof createMockFileService>
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
              createMockFileService,
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

    const photoOf = async (
      plantId: string,
      key: string,
      uploadedByUserId?: string
    ) => {
      const [row] = await db
        .insert(schema.plantPhotos)
        .values({ plantId, url: mockPublicUrl(key), uploadedByUserId })
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

    const diagnose = (plantId: string, key: string, conversationId: string) =>
      Effect.flatMap(Effect.context<ToolContext>(), (runtime) =>
        Effect.promise(async () => {
          await createDiagnosisTool({
            runtime,
            userId: alex,
            permit: chatPermit(plantId, alex),
            plantName: 'Fern',
            image: { key, conversationId },
          }).execute?.(
            {
              diseaseName: 'Root rot',
              severity: 'HIGH',
              confidence: 85,
              symptoms: ['Mushy roots'],
              treatmentSteps: [{ title: 'Repot', careType: 'none' }],
            },
            { toolCallId: 'call-1', messages: [], context: {} }
          )
        })
      )

    const gate = () => {
      const { promise: reached, resolve: reach } = Promise.withResolvers<void>()
      const { promise: opened, resolve: open } = Promise.withResolvers<void>()
      const wait = Effect.promise(() => {
        reach()
        return opened
      })
      return { reached, open, wait }
    }

    const settledOrWaitingOnALock = async (work: Promise<unknown>) => {
      let settled = false
      const settle = () => {
        settled = true
      }
      work.then(settle, settle)
      while (!settled) {
        const { rows } = await pool.query(
          `SELECT 1 FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock'`
        )
        if (rows.length > 0) return
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }

    const diagnosisImages = async () => {
      const rows = await db
        .select({ key: schema.diagnoses.imageKey })
        .from(schema.diagnoses)
      return rows.map(({ key }) => {
        if (key === null) return 'none'
        return gcs.objects.ai.has(key) ? 'stored' : 'missing'
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

      it('still removes the plant when the storage client has a bug', async () => {
        const fern = await plantOf(alex)
        await photoOf(fern, `plants/${fern}/photo.jpg`)
        stored('plant', `plants/${fern}/photo.jpg`)
        gcs.outage.defect = true

        const exit = await as(alex, removeAsCurrentUser(fern))

        expect({
          succeeded: Exit.isSuccess(exit),
          plants: await db.select().from(schema.plants),
        }).toEqual({ succeeded: true, plants: [] })
      })
    })

    describe('deleting a plant photo', () => {
      it('keeps the object when the transaction around the delete rolls back', async () => {
        const fern = await plantOf(alex)
        const photo = await photoOf(fern, `plants/${fern}/photo.jpg`)
        stored('plant', `plants/${fern}/photo.jpg`)

        const exit = await as(
          alex,
          transactQuietly(
            Effect.andThen(
              deletePlantPhoto(permitTo('curate', fern, alex), photo),
              Effect.fail('the caller rolls back' as const)
            )
          )
        )

        expect({
          failure: failureOf(exit),
          photos: (await db.select().from(schema.plantPhotos)).length,
          objects: [...gcs.objects.plant],
        }).toEqual({
          failure: 'the caller rolls back',
          photos: 1,
          objects: [`plants/${fern}/photo.jpg`],
        })
      })

      it('deletes its object', async () => {
        const fern = await plantOf(alex)
        const photo = await photoOf(fern, `plants/${fern}/photo.jpg`)
        await photoOf(fern, `plants/${fern}/other.jpg`)
        stored('plant', `plants/${fern}/photo.jpg`, `plants/${fern}/other.jpg`)

        await done(
          alex,
          deletePlantPhoto(permitTo('curate', fern, alex), photo)
        )

        expect([...gcs.objects.plant]).toEqual([`plants/${fern}/other.jpg`])
      })

      it('deletes the photo its actor uploaded under a photo permit, with its object', async () => {
        const fern = await plantOf(alex)
        const photo = await photoOf(fern, `plants/${fern}/photo.jpg`, sam)
        stored('plant', `plants/${fern}/photo.jpg`)

        await done(sam, deletePlantPhoto(permitTo('photo', fern, sam), photo))

        expect({
          photos: (await db.select().from(schema.plantPhotos)).length,
          objects: [...gcs.objects.plant],
        }).toEqual({ photos: 0, objects: [] })
      })

      it.each([
        ['someone else uploaded', () => alex],
        ['with no known uploader', () => undefined],
      ])(
        'refuses a photo permit on a photo %s and keeps the row and its object',
        async (_, uploader) => {
          const fern = await plantOf(alex)
          const key = `plants/${fern}/photo.jpg`
          const photo = await photoOf(fern, key, uploader())
          stored('plant', key)

          const exit = await as(
            sam,
            deletePlantPhoto(permitTo('photo', fern, sam), photo)
          )

          expect({
            refused: failureOf(exit)._tag,
            photos: (await db.select().from(schema.plantPhotos)).length,
            objects: [...gcs.objects.plant],
          }).toEqual({
            refused: 'PlantNotAuthorizedError',
            photos: 1,
            objects: [key],
          })
        }
      )

      it('keeps the object while the plant still shows it as its image', async () => {
        const fern = await plantOf(alex)
        await db
          .update(schema.plants)
          .set({ imageUrl: mockPublicUrl(`plants/${fern}/photo.jpg`) })
          .where(eq(schema.plants.id, fern))
        const photo = await photoOf(fern, `plants/${fern}/photo.jpg`)
        stored('plant', `plants/${fern}/photo.jpg`)

        await done(
          alex,
          deletePlantPhoto(permitTo('curate', fern, alex), photo)
        )

        expect([...gcs.objects.plant]).toEqual([`plants/${fern}/photo.jpg`])
      })

      it.each([
        ['a bare key', (key: string) => key],
        ['a key with a leading slash', (key: string) => `/${key}`],
        ['a query', (key: string) => `${mockPublicUrl(key)}?alt=media`],
        ['a fragment', (key: string) => `${mockPublicUrl(key)}#x`],
        [
          'an uppercase host',
          (key: string) => `https://STORAGE.googleapis.com/mock-bucket/${key}`,
        ],
        [
          'a virtual host',
          (key: string) => `https://mock-bucket.storage.googleapis.com/${key}`,
        ],
        ['a gs:// URL', (key: string) => `gs://mock-bucket/${key}`],
        [
          'the JSON API',
          (key: string) =>
            `https://storage.googleapis.com/storage/v1/b/mock-bucket/o/${encodeURIComponent(key)}?alt=media`,
        ],
        [
          'a tab the URL parser drops',
          (key: string) =>
            mockPublicUrl(`${key.slice(0, 10)}\t${key.slice(10)}`),
        ],
        [
          'backslashes',
          (key: string) => mockPublicUrl(key.replaceAll('/', '\\')),
        ],
        [
          'a dot segment',
          (key: string) => mockPublicUrl(`plants/elsewhere/../${key.slice(7)}`),
        ],
        [
          'an escaped dot segment',
          (key: string) =>
            mockPublicUrl(`plants/elsewhere/%2E%2E/${key.slice(7)}`),
        ],
        [
          'an escaped dash',
          (key: string) => mockPublicUrl(key.replace('-', '%2D')),
        ],
      ])(
        'keeps the object while another plant shows it as %s',
        async (_, spelled) => {
          const fern = await plantOf(alex)
          const key = `plants/${fern}/photo.jpg`
          await plantOf(alex, spelled(key))
          const photo = await photoOf(fern, key)
          stored('plant', key)

          await done(
            alex,
            deletePlantPhoto(permitTo('curate', fern, alex), photo)
          )

          expect([...gcs.objects.plant]).toEqual([key])
        }
      )

      it('finds a row that shows an escaped caret key with a caret', async () => {
        const fern = await plantOf(alex)
        const name = `a^${'b'.repeat(40)}.jpg`
        const key = `plants/${fern}/${encodeURIComponent(name)}`
        const caret = mockPublicUrl(`plants/${fern}/${name}`)
        await plantOf(alex, caret)

        const held = await done(
          alex,
          Effect.flatMap(StoredRefRepository, (refs) =>
            refs.stillHeld([{ bucket: 'plant', key }])
          )
        )

        expect(namedObjects(MOCK_BUCKET_NAMES)(caret)).toContainEqual({
          bucket: 'plant',
          key,
        })
        expect(held).toEqual([caret])
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

      it('keeps an image a diagnosis holds as a signed URL', async () => {
        const fern = await plantOf(alex)
        const leaf = `users/${alex}/chat/c1/leaf.jpg`
        const conversation = await conversationOf(alex, fern, [leaf])
        await diagnosisOf(
          fern,
          alex,
          `https://storage.googleapis.com/mock-private-bucket/${leaf}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=sa%40p.iam.gserviceaccount.com%2F20261116%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Signature=abc`
        )
        stored('ai', leaf)

        await done(alex, deleteConversation(conversation))

        expect([...gcs.objects.ai]).toEqual([leaf])
      })

      it('keeps the image of a diagnosis that is written while the conversation is deleted', async () => {
        const fern = await plantOf(alex)
        const leaf = `users/${alex}/chat/c1/leaf.jpg`
        const conversation = await conversationOf(alex, fern, [leaf])
        stored('ai', leaf)
        const beforeTheDiagnosisRow = gate()

        const diagnosing = done(
          alex,
          Effect.flatMap(DiagnosisRepository, (repo) =>
            Effect.provideService(
              diagnose(fern, leaf, conversation),
              DiagnosisRepository,
              {
                ...repo,
                create: (data) =>
                  Effect.andThen(beforeTheDiagnosisRow.wait, repo.create(data)),
              }
            )
          )
        )
        await beforeTheDiagnosisRow.reached
        const deleting = done(alex, deleteConversation(conversation))
        await settledOrWaitingOnALock(deleting)
        beforeTheDiagnosisRow.open()
        await Promise.all([diagnosing, deleting])

        expect({
          conversations: await db.select().from(schema.chatConversations),
          diagnosisImages: await diagnosisImages(),
        }).toEqual({ conversations: [], diagnosisImages: ['stored'] })
      })

      it('writes a diagnosis without the image once its conversation is gone', async () => {
        const fern = await plantOf(alex)
        const leaf = `users/${alex}/chat/c1/leaf.jpg`
        const conversation = await conversationOf(alex, fern, [leaf])
        stored('ai', leaf)
        const beforeTheCommit = gate()

        const deleting = done(
          alex,
          Effect.flatMap(StoredRefRepository, (refs) =>
            Effect.provideService(
              deleteConversation(conversation),
              StoredRefRepository,
              {
                ...refs,
                stillHeld: (held) =>
                  Effect.andThen(beforeTheCommit.wait, refs.stillHeld(held)),
              }
            )
          )
        )
        await beforeTheCommit.reached
        const diagnosing = done(alex, diagnose(fern, leaf, conversation))
        await settledOrWaitingOnALock(diagnosing)
        beforeTheCommit.open()
        await Promise.all([diagnosing, deleting])

        expect({
          conversations: await db.select().from(schema.chatConversations),
          diagnosisImages: await diagnosisImages(),
        }).toEqual({ conversations: [], diagnosisImages: ['none'] })
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

      it('refuses a care permit on a care someone else performed and keeps the row and its photo', async () => {
        const fern = await plantOf(alex)
        const key = `plants/${fern}/care.jpg`
        const log = await careLogOf(fern, key)
        stored('plant', key)

        const exit = await as(sam, deleteCareLog(carePermit(fern, sam), log))

        expect({
          refused: failureOf(exit)._tag,
          logs: (await db.select().from(schema.careLogs)).length,
          objects: [...gcs.objects.plant],
        }).toEqual({
          refused: 'PlantNotAuthorizedError',
          logs: 1,
          objects: [key],
        })
      })
    })
  }
)
