import {
  createInMemoryGCS,
  MOCK_BUCKET_NAMES,
  mockPublicUrl,
} from '@lily/api/__tests__/mocks/gcs.service'
import { StoredRefRepositoryLive } from '@lily/api/repositories/stored-ref.repository'
import { type SweepOptions, sweepOrphans } from '@lily/api/scripts/orphan-sweep'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import type { BucketRole } from '@lily/shared/services/file/stored-object'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, DateTime, Duration, Effect, Layer, References } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const RefsLive = StoredRefRepositoryLive.pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

const DRY: SweepOptions = {
  apply: false,
  grace: Duration.days(7),
  batchSize: 2,
}

const LEGACY_KEY = '1690000000000-plants/p1/photo-1690000000000.jpg'
const HASH_KEY = '1690000000000-my#pic.jpg'
const QUERY_KEY = '1690000000000-what?.jpg'
const BARE_KEY = '1690000000000-scan#2?.jpg'

const OBJECTS: ReadonlyArray<readonly [BucketRole, string, number]> = [
  ['plant', LEGACY_KEY, 900],
  ['plant', 'plants/p1/photo one.jpg', 30],
  ['plant', 'plants/p1/care.jpg', 30],
  ['plant', 'users/a/avatar.jpg', 30],
  ['plant', 'catalog/fern.jpg', 30],
  ['ai', 'users/a/chat/first.jpg', 30],
  ['ai', 'users/a/chat/second.jpg', 30],
  ['ai', 'users/a/diagnosis.jpg', 30],
  ['ai', 'users/a/rare.jpg', 30],
  ['plant', 'plants/p1/fresh.jpg', 1],
  ['plant', 'plants/p1/old.jpg', 30],
  ['ai', 'users/a/chat/old.jpg', 30],
  ['plant', 'exports/dump.csv', 30],
  ['plant', HASH_KEY, 900],
  ['plant', QUERY_KEY, 900],
  ['ai', BARE_KEY, 900],
]

const signed = (bucket: string, key: string) =>
  `https://storage.googleapis.com/${bucket}/${key}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc`

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Orphan sweep - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let gcs: ReturnType<typeof createInMemoryGCS>

    const sweep = (options: SweepOptions) =>
      Effect.runPromise(
        sweepOrphans(options).pipe(
          Effect.provide(Layer.mergeAll(gcs.layer, RefsLive)),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

    const verdicts = (
      decided: ReadonlyArray<{ key: string; verdict: string }>
    ) =>
      Object.fromEntries(
        Array.map(decided, ({ key, verdict }) => [key, verdict])
      )

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
      gcs = createInMemoryGCS()
      for (const [bucket, key, age] of OBJECTS) {
        gcs.put(bucket, key, {
          size: 1000,
          createdAt: DateTime.subtract(DateTime.nowUnsafe(), { days: age }),
        })
      }

      const [user] = await db
        .insert(schema.users)
        .values({
          email: `alex-${Date.now()}@example.com`,
          name: 'Alex',
          emailVerified: true,
          role: 'user',
          status: 'active',
          timezone: 'UTC',
          image: mockPublicUrl('users/a/avatar.jpg'),
        })
        .returning()
      if (!user) throw new Error('user insert returned nothing')
      await db.insert(schema.users).values({
        email: `sam-${Date.now()}@example.com`,
        name: 'Sam',
        emailVerified: true,
        role: 'user',
        status: 'active',
        timezone: 'UTC',
        image: 'https://lh3.googleusercontent.com/a/oauth-avatar',
      })
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
          imageUrl: `https://${MOCK_BUCKET_NAMES.plant}.storage.googleapis.com/${LEGACY_KEY}?X-Goog-Signature=abc`,
        })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      await db.insert(schema.plantPhotos).values([
        {
          plantId: plant.id,
          url: `http://storage.cloud.google.com/${MOCK_BUCKET_NAMES.plant}/plants/p1/photo%20one.jpg`,
        },
        { plantId: plant.id, url: mockPublicUrl(HASH_KEY) },
        { plantId: plant.id, url: mockPublicUrl(QUERY_KEY) },
      ])
      await db.insert(schema.careLogs).values({
        plantId: plant.id,
        type: 'watering',
        careDay: '2026-11-01',
        date: new Date('2026-11-01T09:00:00Z'),
        photoUrl: mockPublicUrl('plants/p1/care.jpg'),
        performedByUserId: user.id,
      })
      await db.insert(schema.plantCatalog).values({
        imageUrl: mockPublicUrl('catalog/fern.jpg'),
        wateringFrequencyDays: 7,
        humidityRating: 50,
        lightingRating: 50,
        petToxicityRating: 0,
        wateringRating: 50,
      })
      const [conversation] = await db
        .insert(schema.chatConversations)
        .values({ userId: user.id, kind: 'general' })
        .returning()
      if (!conversation) throw new Error('conversation insert returned nothing')
      await db.insert(schema.chatMessages).values({
        conversationId: conversation.id,
        userId: user.id,
        role: 'user',
        content: 'Look at these leaves',
        imageKey: 'users/a/chat/first.jpg',
        parts: [
          { type: 'text', text: 'Look at these leaves' },
          {
            type: 'file',
            mediaType: 'image/jpeg',
            url: 'users/a/chat/first.jpg',
          },
          {
            type: 'file',
            mediaType: 'image/jpeg',
            url: 'users/a/chat/second.jpg',
          },
        ],
      })
      await db.insert(schema.diagnoses).values({
        plantId: plant.id,
        userId: user.id,
        diseaseName: 'Root rot',
        severity: 'MODERATE',
        confidence: 80,
        symptoms: ['yellow leaves'],
        treatmentSteps: ['repot'],
        imageKey: 'users/a/diagnosis.jpg',
      })
      await db.insert(schema.diagnoses).values({
        plantId: plant.id,
        userId: user.id,
        diseaseName: 'Leaf spot',
        severity: 'MODERATE',
        confidence: 70,
        symptoms: ['brown spots'],
        treatmentSteps: ['prune'],
        imageKey: BARE_KEY,
      })
      await db.insert(schema.rarePlantIdentifications).values({
        userId: user.id,
        imageUrl: signed(MOCK_BUCKET_NAMES.ai, 'users/a/rare.jpg'),
      })
    })

    afterAll(async () => {
      await pool.end()
    })

    it('reads a reference from every photo column and decides each object', async () => {
      const result = await sweep(DRY)

      expect(Object.fromEntries(result.refsBySource)).toEqual({
        'plants.image_url': 1,
        'plant_photos.url': 3,
        'care_logs.photo_url': 1,
        'users.image': 2,
        'plant_catalog.image_url': 1,
        'chat_messages.image_key': 1,
        'chat_messages.parts': 2,
        'diagnoses.image_key': 2,
        'rare_plant_identifications.image_url': 1,
      })
      expect(verdicts(result.decided)).toEqual({
        [LEGACY_KEY]: 'referenced',
        'plants/p1/photo one.jpg': 'referenced',
        'plants/p1/care.jpg': 'referenced',
        'users/a/avatar.jpg': 'referenced',
        'catalog/fern.jpg': 'referenced',
        'users/a/chat/first.jpg': 'referenced',
        'users/a/chat/second.jpg': 'referenced',
        'users/a/diagnosis.jpg': 'referenced',
        'users/a/rare.jpg': 'referenced',
        'plants/p1/fresh.jpg': 'inside-grace',
        'plants/p1/old.jpg': 'orphan',
        'users/a/chat/old.jpg': 'orphan',
        'exports/dump.csv': 'foreign',
        [HASH_KEY]: 'referenced',
        [QUERY_KEY]: 'referenced',
        [BARE_KEY]: 'referenced',
      })
      expect(result.blockers).toEqual([])
      expect(result.outcomes).toEqual([])
      expect(gcs.objects.plant.size + gcs.objects.ai.size).toBe(OBJECTS.length)
    })

    it('deletes only the orphans with apply, and a rerun deletes nothing', async () => {
      const first = await sweep({ ...DRY, apply: true })
      const second = await sweep({ ...DRY, apply: true })

      expect(
        Array.map(first.outcomes, ({ _tag, object }) => [
          _tag,
          object.bucket,
          object.key,
        ])
      ).toEqual([
        ['Deleted', 'plant', 'plants/p1/old.jpg'],
        ['Deleted', 'ai', 'users/a/chat/old.jpg'],
      ])
      expect([...gcs.objects.plant].sort()).toEqual([
        HASH_KEY,
        LEGACY_KEY,
        QUERY_KEY,
        'catalog/fern.jpg',
        'exports/dump.csv',
        'plants/p1/care.jpg',
        'plants/p1/fresh.jpg',
        'plants/p1/photo one.jpg',
        'users/a/avatar.jpg',
      ])
      expect([...gcs.objects.ai].sort()).toEqual([
        BARE_KEY,
        'users/a/chat/first.jpg',
        'users/a/chat/second.jpg',
        'users/a/diagnosis.jpg',
        'users/a/rare.jpg',
      ])
      expect(second.outcomes).toEqual([])
      expect(second.tallies.plant.orphan.count).toBe(0)
      expect(second.tallies.ai.orphan.count).toBe(0)
    })
  }
)
