import { delivered } from '@lily/api/__tests__/integration/canopy-layers'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import {
  createInMemoryGCS,
  mockPublicUrl,
} from '@lily/api/__tests__/mocks/gcs.service'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { CareReadsLive } from '@lily/api/contexts/care'
import { AccountPhotoRepositoryLive } from '@lily/api/repositories/account-photo.repository'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { purgeAccount } from '@lily/api/services/user/helpers/purge-account'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Cause, Effect, Exit, Layer, ManagedRuntime, References } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { Pool } = pg

const BaseLive = Layer.mergeAll(
  AccountPhotoRepositoryLive,
  PlantRepositoryLive,
  CareLogRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  NotificationRepositoryLive,
  UserRepositoryLive,
  CarePlanRepositoryLive,
  CanopyRepositoryLive,
  DelegationRepositoryLive,
  RoomRepositoryLive,
  DeviceTokenRepositoryLive,
  ActivityPushTokenRepositoryLive,
  SubscriptionRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const outcome = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => 'ok',
    onFailure: (cause) =>
      (Cause.squash(cause) as { readonly _tag?: string })._tag ?? 'failed',
  })

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Purging an account deletes its stored photos - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof BaseLive>,
      Layer.Error<typeof BaseLive>
    >
    let gcs: ReturnType<typeof createInMemoryGCS>

    const purge = (userId: string) =>
      runtime.runPromiseExit(
        delivered(purgeAccount(userId)).pipe(
          Effect.provide(
            Layer.mergeAll(
              gcs.layer,
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

    const user = async (name: string) => {
      const [row] = await db
        .insert(schema.users)
        .values({
          email: `${name}-${Date.now()}-${Math.random()}@example.com`,
          name,
          emailVerified: true,
          role: 'user',
          status: 'active',
        })
        .returning()
      if (!row) throw new Error(`Failed to create ${name}`)
      return row.id
    }

    const plant = async (
      owner: { userId: string } | { canopyId: string },
      createdBy: string
    ) => {
      const [row] = await db
        .insert(schema.plants)
        .values({
          ...owner,
          createdByUserId: createdBy,
          name: 'Fern',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!row) throw new Error('Failed to create plant')
      return row.id
    }

    const canopyOf = async (ownerId: string, memberId: string) => {
      const [canopy] = await db
        .insert(schema.canopies)
        .values({ name: 'Flat', timezone: 'UTC' })
        .returning()
      if (!canopy) throw new Error('Failed to create canopy')
      await db.insert(schema.canopyMembers).values([
        { canopyId: canopy.id, userId: ownerId, role: 'owner' },
        { canopyId: canopy.id, userId: memberId, role: 'member' },
      ])
      return canopy.id
    }

    const store = (bucket: 'plant' | 'ai', keys: readonly string[]) => {
      for (const key of keys) gcs.objects[bucket].add(key)
    }

    const stored = () => ({
      plant: [...gcs.objects.plant].sort(),
      ai: [...gcs.objects.ai].sort(),
    })

    const usersLeft = async () => {
      const rows = await db.select({ id: schema.users.id }).from(schema.users)
      return rows.map((row) => row.id).sort()
    }

    /**
     * Alex and Sam share a canopy. Alex owns a fern, shared a ficus with the
     * canopy, and has photos of every kind in both buckets, in the scoped
     * layout and in the older ones. Alex's cactus shows the scan photo of
     * Sam's plant, which a client can set.
     */
    const world = async () => {
      const alex = await user('alex')
      const sam = await user('sam')
      const canopy = await canopyOf(sam, alex)
      const fern = await plant({ userId: alex }, alex)
      const cactus = await plant({ userId: alex }, alex)
      const ficus = await plant({ canopyId: canopy }, alex)
      const samsPlant = await plant({ userId: sam }, sam)
      const [conversation] = await db
        .insert(schema.chatConversations)
        .values({ userId: alex, kind: 'general' })
        .returning()
      if (!conversation) throw new Error('Failed to create conversation')

      const alexPublic = [
        `users/${alex}/avatars/now.png`,
        `users/${alex}/avatars/replaced.png`,
        `plants/${fern}/hero.png`,
        `plants/${fern}/replaced.png`,
        `1700-plants/${fern}/old.png`,
        `1700-avatars/${alex}/old.png`,
        '1700-detect/alex-scan.png',
        '1699-IMG_0042.jpg',
      ]
      const alexPrivate = [
        `users/${alex}/detect/never-kept.png`,
        `users/${alex}/identify/never-kept.png`,
        `users/${alex}/scan-card/never-kept.png`,
        `users/${alex}/chat/${conversation.id}/sent.png`,
        `1700-chat/${conversation.id}/old.png`,
        `1700-chat/${conversation.id}/diagnosed.png`,
      ]
      const othersPublic = [
        `plants/${ficus}/hero.png`,
        `users/${sam}/avatars/now.png`,
        `plants/${samsPlant}/hero.png`,
        '1700-detect/sam-scan.png',
      ]
      const othersPrivate = [`users/${sam}/detect/never-kept.png`]
      store('plant', [...alexPublic, ...othersPublic])
      store('ai', [...alexPrivate, ...othersPrivate])

      await db
        .update(schema.users)
        .set({ image: mockPublicUrl(`1700-avatars/${alex}/old.png`) })
        .where(eq(schema.users.id, alex))
      await db
        .update(schema.plants)
        .set({ imageUrl: mockPublicUrl('1700-detect/alex-scan.png') })
        .where(eq(schema.plants.id, fern))
      await db
        .update(schema.plants)
        .set({ imageUrl: mockPublicUrl(`plants/${ficus}/hero.png`) })
        .where(eq(schema.plants.id, ficus))
      await db
        .update(schema.plants)
        .set({ imageUrl: mockPublicUrl('1700-detect/sam-scan.png') })
        .where(eq(schema.plants.id, samsPlant))
      await db
        .update(schema.plants)
        .set({ imageUrl: mockPublicUrl('1700-detect/sam-scan.png') })
        .where(eq(schema.plants.id, cactus))
      await db.insert(schema.plantPhotos).values([
        { plantId: fern, url: mockPublicUrl(`1700-plants/${fern}/old.png`) },
        { plantId: fern, url: mockPublicUrl('1699-IMG_0042.jpg') },
      ])
      await db.insert(schema.chatMessages).values({
        role: 'user',
        content: 'What is this?',
        imageKey: `1700-chat/${conversation.id}/old.png`,
        userId: alex,
        conversationId: conversation.id,
      })
      await db.insert(schema.diagnoses).values({
        plantId: ficus,
        userId: alex,
        diseaseName: 'Root rot',
        severity: 'LOW',
        confidence: 80,
        symptoms: [],
        treatmentSteps: [],
        imageKey: `1700-chat/${conversation.id}/diagnosed.png`,
      })

      return {
        alex,
        sam,
        others: {
          plant: [...othersPublic].sort(),
          ai: [...othersPrivate].sort(),
        },
        everything: {
          plant: [...alexPublic, ...othersPublic].sort(),
          ai: [...alexPrivate, ...othersPrivate].sort(),
        },
      }
    }

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

    it("deletes the account's photos in both buckets and keeps everyone else's", async () => {
      const { alex, sam, others } = await world()

      const purged = await purge(alex)

      expect(outcome(purged)).toBe('ok')
      expect(stored()).toEqual(others)
      expect(await usersLeft()).toEqual([sam])
    })

    it('keeps the account when the buckets cannot be reached, and finishes on the next run', async () => {
      const { alex, sam, others, everything } = await world()
      gcs.outage.deletes = true

      const failed = await purge(alex)

      expect(outcome(failed)).toBe('GCSDeleteError')
      expect(stored()).toEqual(everything)
      expect(await usersLeft()).toEqual([alex, sam].sort())

      gcs.outage.deletes = false
      const retried = await purge(alex)
      const repeated = await purge(alex)

      expect([outcome(retried), outcome(repeated)]).toEqual(['ok', 'ok'])
      expect(stored()).toEqual(others)
      expect(await usersLeft()).toEqual([sam])
    })
  }
)
