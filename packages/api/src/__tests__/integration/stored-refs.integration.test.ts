import {
  MOCK_BUCKET_NAMES,
  mockPublicUrl,
} from '@lily/api/__tests__/mocks/gcs.service'
import {
  type RefSource,
  type StoredRef,
  StoredRefRepository,
  StoredRefRepositoryLive,
} from '@lily/api/repositories/stored-ref.repository'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { StoredObject } from '@lily/shared/services/file/stored-object'
import { mintStoredRef } from '@lily/shared/services/file/stored-ref-mint'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, Effect, Layer, Record, Stream } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RefsLive = StoredRefRepositoryLive.pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

interface Owner {
  readonly userId: string
  readonly plantId: string
  readonly conversationId: string
}

/** A stored object and the one row reference that names it. */
interface Held {
  readonly object: StoredObject
  readonly ref: string
}

const signed = (key: string) =>
  `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.ai}/${key}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc`

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Stored refs - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let owner: Owner

    const run = <A, E>(effect: Effect.Effect<A, E, StoredRefRepository>) =>
      Effect.runPromise(effect.pipe(Effect.provide(RefsLive)))

    const stillHeld = (objects: ReadonlyArray<StoredObject>) =>
      run(
        Effect.flatMap(StoredRefRepository, (refs) => refs.stillHeld(objects))
      )

    const everyRef = () =>
      run(
        Effect.flatMap(StoredRefRepository, (refs) =>
          Stream.runCollect(refs.everyRef)
        )
      )

    /** Each column that can hold a stored object, writing a row that alone names one. */
    const HOLDERS: Record<RefSource, (owner: Owner) => Promise<Held>> = {
      'plants.image_url': async ({ userId }) => {
        const ref = mockPublicUrl('plants/p2/cover.jpg')
        await db.insert(schema.plants).values({
          userId,
          createdByUserId: userId,
          name: 'Monstera',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
          imageUrl: mintStoredRef(ref),
        })
        return { object: { bucket: 'plant', key: 'plants/p2/cover.jpg' }, ref }
      },
      'plant_photos.url': async ({ plantId }) => {
        const ref = mockPublicUrl('plants/p1/photo.jpg')
        await db.insert(schema.plantPhotos).values({ plantId, url: ref })
        return { object: { bucket: 'plant', key: 'plants/p1/photo.jpg' }, ref }
      },
      'care_logs.photo_url': async ({ userId, plantId }) => {
        const ref = mockPublicUrl('plants/p1/care.jpg')
        await db.insert(schema.careLogs).values({
          plantId,
          type: 'watering',
          careDay: '2026-11-01',
          date: new Date('2026-11-01T09:00:00Z'),
          photoUrl: mintStoredRef(ref),
          performedByUserId: userId,
        })
        return { object: { bucket: 'plant', key: 'plants/p1/care.jpg' }, ref }
      },
      'users.image': async () => {
        const ref = mockPublicUrl('users/b/avatars/me.jpg')
        await db.insert(schema.users).values({
          email: `sam-${crypto.randomUUID()}@example.com`,
          name: 'Sam',
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
          image: mintStoredRef(ref),
        })
        return {
          object: { bucket: 'plant', key: 'users/b/avatars/me.jpg' },
          ref,
        }
      },
      'plant_catalog.image_url': async () => {
        const ref = mockPublicUrl('catalog/fern.jpg')
        await db.insert(schema.plantCatalog).values({
          imageUrl: mintStoredRef(ref),
          wateringFrequencyDays: 7,
          humidityRating: 50,
          lightingRating: 50,
          petToxicityRating: 0,
          wateringRating: 50,
        })
        return { object: { bucket: 'plant', key: 'catalog/fern.jpg' }, ref }
      },
      'chat_messages.image_key': async ({ userId, conversationId }) => {
        const ref = 'users/a/chat/c1/key.jpg'
        await db.insert(schema.chatMessages).values({
          conversationId,
          userId,
          role: 'user',
          content: 'Look',
          imageKey: mintStoredRef(ref),
        })
        return { object: { bucket: 'ai', key: ref }, ref }
      },
      'chat_messages.parts': async ({ userId, conversationId }) => {
        const ref = 'users/a/chat/c1/second.jpg'
        await db.insert(schema.chatMessages).values({
          conversationId,
          userId,
          role: 'user',
          content: 'Look at these leaves',
          imageKey: mintStoredRef('users/a/chat/c1/first.jpg'),
          parts: [
            { type: 'text', text: 'Look at these leaves' },
            {
              type: 'file',
              mediaType: 'image/jpeg',
              url: 'users/a/chat/c1/first.jpg',
            },
            { type: 'file', mediaType: 'image/jpeg', url: ref },
          ],
        })
        return { object: { bucket: 'ai', key: ref }, ref }
      },
      'diagnoses.image_key': async ({ userId, plantId }) => {
        const ref = 'users/a/diagnosis.jpg'
        await db.insert(schema.diagnoses).values({
          plantId,
          userId,
          diseaseName: 'Root rot',
          severity: 'MODERATE',
          confidence: 80,
          symptoms: ['yellow leaves'],
          treatmentSteps: ['repot'],
          imageKey: mintStoredRef(ref),
        })
        return { object: { bucket: 'ai', key: ref }, ref }
      },
      'rare_plant_identifications.image_url': async ({ userId }) => {
        const ref = signed('users/a/identify/rare.jpg')
        await db.insert(schema.rarePlantIdentifications).values({
          userId,
          imageUrl: mintStoredRef(ref),
        })
        return {
          object: { bucket: 'ai', key: 'users/a/identify/rare.jpg' },
          ref,
        }
      },
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
    })

    beforeEach(async () => {
      for (const table of ['users', 'plant_catalog']) {
        await db.execute(
          sql.raw(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
        )
      }
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `alex-${crypto.randomUUID()}@example.com`,
          name: 'Alex',
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      const [plant] = await db
        .insert(schema.plants)
        .values({
          userId: user.id,
          createdByUserId: user.id,
          name: 'Fern',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      const [conversation] = await db
        .insert(schema.chatConversations)
        .values({ userId: user.id, kind: 'general' })
        .returning()
      if (!conversation) throw new Error('conversation insert returned nothing')
      owner = {
        userId: user.id,
        plantId: plant.id,
        conversationId: conversation.id,
      }
    })

    afterAll(async () => {
      await pool.end()
    })

    it.each(Record.keys(HOLDERS))(
      'reports an object held only by %s as still held',
      async (source) => {
        const { object, ref } = await HOLDERS[source](owner)

        expect(await stillHeld([object])).toContain(ref)
      }
    )

    it('reads the same holders in the sweep and in the release check', async () => {
      const held = await Promise.all(
        Array.map(Record.toEntries(HOLDERS), async ([source, write]) => ({
          source,
          ...(await write(owner)),
        }))
      )

      const swept: ReadonlyArray<StoredRef> = await everyRef()
      const releasing = await stillHeld(Array.map(held, ({ object }) => object))

      expect(swept).toEqual(
        expect.arrayContaining(
          Array.map(held, ({ source, ref }) => ({ source, ref }))
        )
      )
      expect(releasing).toEqual(
        expect.arrayContaining(Array.map(held, ({ ref }) => ref))
      )
    })
  }
)
