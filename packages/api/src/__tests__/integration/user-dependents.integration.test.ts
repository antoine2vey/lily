import { settled } from '@lily/api/__tests__/integration/canopy-layers'
import { NoStoredPhotosLive } from '@lily/api/__tests__/mocks/account-photo.repository'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { Canopy } from '@lily/api/contexts/canopy'
import { CareReadsLive } from '@lily/api/contexts/care'
import { ReminderStoreLive } from '@lily/api/contexts/reminders'
import {
  type Policy,
  UNLINKED_USER_COLUMNS,
  USER_DEPENDENTS,
  type UserDependent,
  type UserDependentColumn,
} from '@lily/api/kernel/user-dependents'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import { CanopyRepositoryLive } from '@lily/api/repositories/canopy.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepositoryLive } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { MagicLinkRepositoryLive } from '@lily/api/repositories/magic-link.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { NotificationDeliveryLive } from '@lily/api/repositories/notification-delivery.repository'
import { OAuthCodeRepositoryLive } from '@lily/api/repositories/oauth-code.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { deleteExpiredSignInRows } from '@lily/api/services/auth/cleanup-scheduler'
import { purgeAccount } from '@lily/api/services/user/helpers/purge-account'
import { releaseAccount } from '@lily/api/services/user/helpers/release-account'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { Rating } from '@lily/shared'
import { mintStoredRef } from '@lily/shared/services/file/stored-ref-mint'
import { and, eq, type SQL, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Array,
  Effect,
  Layer,
  ManagedRuntime,
  Match,
  Option,
  Record,
  References,
  String,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const REGISTRY = 'packages/api/src/kernel/user-dependents.ts'

const DAY = 86_400_000

const BaseLive = Layer.mergeAll(
  ActivityPushTokenRepositoryLive,
  CanopyRepositoryLive,
  CareLogRepositoryLive,
  CarePlanRepositoryLive,
  CareScheduleRepositoryLive,
  CareReadsLive,
  DelegationRepositoryLive,
  DeviceTokenRepositoryLive,
  MagicLinkRepositoryLive,
  NotificationRepositoryLive,
  OAuthCodeRepositoryLive,
  ReminderStoreLive,
  NotificationDeliveryLive,
  PlantRepositoryLive,
  RefreshTokenRepositoryLive,
  RoomRepositoryLive,
  SubscriptionRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const plantValues = {
  name: 'Monstera',
  humidityRating: Rating.make(3),
  lightingRating: Rating.make(3),
  petToxicityRating: Rating.make(1),
  wateringRating: Rating.make(3),
}

interface World {
  readonly subject: string
  readonly owner: string
  readonly third: string
  readonly canopyId: string
  readonly memberId: string
  readonly sharedPlant: string
  readonly canopyPlant: string
  readonly ownPlant: string
  readonly thirdsPlant: string
  readonly clientId: string
  readonly giftCodeId: string
}

type Db = ReturnType<typeof drizzle<typeof schema>>

type Seed = (db: Db, w: World) => Promise<SQL>

const returned = <T>(rows: ReadonlyArray<T>): T =>
  Option.getOrThrowWith(
    Array.head(rows),
    () => new Error('insert returned nothing')
  )

const SEEDS: Record<UserDependentColumn, Seed> = {
  'activity_push_tokens.user_id': async (db, w) => {
    const device = returned(
      await db
        .insert(schema.deviceTokens)
        .values({
          token: 'activity-device',
          platform: 'ios',
          userId: w.subject,
        })
        .returning()
    )
    const row = returned(
      await db
        .insert(schema.activityPushTokens)
        .values({
          userId: w.subject,
          deviceTokenId: device.id,
          kind: 'start',
          token: 'start-token',
        })
        .returning()
    )
    return eq(schema.activityPushTokens.id, row.id)
  },
  'canopy_direct_invites.invited_by_user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.canopyDirectInvites)
        .values({
          canopyId: w.canopyId,
          inviteeUserId: w.third,
          invitedByUserId: w.subject,
          expiresAt: new Date(Date.now() + DAY),
        })
        .returning()
    )
    return eq(schema.canopyDirectInvites.id, row.id)
  },
  'canopy_direct_invites.invitee_user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.canopyDirectInvites)
        .values({
          canopyId: w.canopyId,
          inviteeUserId: w.subject,
          invitedByUserId: w.owner,
          expiresAt: new Date(Date.now() + DAY),
        })
        .returning()
    )
    return eq(schema.canopyDirectInvites.id, row.id)
  },
  'canopy_invites.created_by_user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.canopyInvites)
        .values({
          canopyId: w.canopyId,
          tokenHash: `link-${w.canopyId}`,
          createdByUserId: w.subject,
          expiresAt: new Date(Date.now() + DAY),
        })
        .returning()
    )
    return eq(schema.canopyInvites.id, row.id)
  },
  'canopy_members.user_id': async (_, w) =>
    eq(schema.canopyMembers.id, w.memberId),
  'canopy_plant_mutes.user_id': async (db, w) => {
    await db
      .insert(schema.canopyPlantMutes)
      .values({ userId: w.subject, plantId: w.canopyPlant })
    return and(
      eq(schema.canopyPlantMutes.userId, w.subject),
      eq(schema.canopyPlantMutes.plantId, w.canopyPlant)
    ) as SQL
  },
  'care_delegations.caretaker_id': async (db, w) =>
    delegation(db, { ownerId: w.third, caretakerId: w.subject }, w.thirdsPlant),
  'care_delegations.owner_id': async (db, w) =>
    delegation(db, { ownerId: w.subject, caretakerId: w.third }, w.ownPlant),
  'care_logs.performed_by_user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.careLogs)
        .values({
          type: 'watering',
          careDay: '2026-11-01',
          plantId: w.canopyPlant,
          performedByUserId: w.subject,
        })
        .returning()
    )
    return eq(schema.careLogs.id, row.id)
  },
  'care_plans.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.carePlans)
        .values({ plantId: w.canopyPlant, userId: w.subject, title: 'Repot' })
        .returning()
    )
    return eq(schema.carePlans.id, row.id)
  },
  'chat_conversations.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.chatConversations)
        .values({ userId: w.subject, kind: 'plant', plantId: w.canopyPlant })
        .returning()
    )
    return eq(schema.chatConversations.id, row.id)
  },
  'chat_follow_up_sets.user_id': async (db, w) => {
    await db
      .insert(schema.chatFollowUpSets)
      .values({ userId: w.subject, plantId: w.canopyPlant, language: 'en' })
    return and(
      eq(schema.chatFollowUpSets.userId, w.subject),
      eq(schema.chatFollowUpSets.plantId, w.canopyPlant)
    ) as SQL
  },
  'chat_messages.user_id': async (db, w) => {
    const ownersChat = returned(
      await db
        .insert(schema.chatConversations)
        .values({ userId: w.owner, kind: 'plant', plantId: w.canopyPlant })
        .returning()
    )
    const row = returned(
      await db
        .insert(schema.chatMessages)
        .values({
          role: 'user',
          content: 'Is it thirsty?',
          userId: w.subject,
          conversationId: ownersChat.id,
        })
        .returning()
    )
    return eq(schema.chatMessages.id, row.id)
  },
  'dead_letter_messages.user_id': async (db, w) =>
    eq(schema.deadLetterMessages.id, await deadLetter(db, w.subject)),
  'device_tokens.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.deviceTokens)
        .values({ token: 'push-device', platform: 'ios', userId: w.subject })
        .returning()
    )
    return eq(schema.deviceTokens.id, row.id)
  },
  'diagnoses.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.diagnoses)
        .values({
          plantId: w.canopyPlant,
          userId: w.subject,
          diseaseName: 'Root rot',
          severity: 'LOW',
          confidence: 80,
          symptoms: [],
          treatmentSteps: [],
        })
        .returning()
    )
    return eq(schema.diagnoses.id, row.id)
  },
  'gift_code_redemptions.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.giftCodeRedemptions)
        .values({ giftCodeId: w.giftCodeId, userId: w.subject })
        .returning()
    )
    return eq(schema.giftCodeRedemptions.id, row.id)
  },
  'notifications.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.notifications)
        .values({
          type: 'photo_reminder',
          scheduledAt: new Date(Date.now() + DAY),
          userId: w.subject,
          plantId: w.canopyPlant,
        })
        .returning()
    )
    return eq(schema.notifications.id, row.id)
  },
  'oauth_access_tokens.user_id': async (db, w) => {
    await db.insert(schema.oauthAccessTokens).values({
      token: 'mcp-access',
      clientId: w.clientId,
      userId: w.subject,
      scopes: ['plants:read'],
      expiresAt: new Date(Date.now() + DAY),
    })
    return eq(schema.oauthAccessTokens.token, 'mcp-access')
  },
  'oauth_identities.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.oauthIdentities)
        .values({
          userId: w.subject,
          provider: 'apple',
          providerUserId: `apple-${w.subject}`,
        })
        .returning()
    )
    return eq(schema.oauthIdentities.id, row.id)
  },
  'oauth_refresh_tokens.user_id': async (db, w) => {
    await db.insert(schema.oauthRefreshTokens).values({
      token: 'mcp-refresh',
      clientId: w.clientId,
      userId: w.subject,
      scopes: ['plants:read'],
      expiresAt: new Date(Date.now() + DAY),
    })
    return eq(schema.oauthRefreshTokens.token, 'mcp-refresh')
  },
  'oauth_user_api_credentials.user_id': async (db, w) => {
    await db.insert(schema.oauthUserApiCredentials).values({
      userId: w.subject,
      apiJwt: 'jwt',
      apiRefreshToken: 'api-refresh',
    })
    return eq(schema.oauthUserApiCredentials.userId, w.subject)
  },
  'plant_photos.uploaded_by_user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.plantPhotos)
        .values({
          url: mintStoredRef('https://example.com/leaf.jpg'),
          plantId: w.canopyPlant,
          uploadedByUserId: w.subject,
        })
        .returning()
    )
    return eq(schema.plantPhotos.id, row.id)
  },
  'plant_scans.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.plantScans)
        .values({ scanType: 'card', userId: w.subject })
        .returning()
    )
    return eq(schema.plantScans.id, row.id)
  },
  'plants.created_by_user_id': async (_, w) =>
    eq(schema.plants.id, w.sharedPlant),
  'plants.user_id': async (_, w) => eq(schema.plants.id, w.ownPlant),
  'rare_plant_identifications.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.rarePlantIdentifications)
        .values({
          userId: w.subject,
          imageUrl: mintStoredRef('https://example.com/rare.jpg'),
        })
        .returning()
    )
    return eq(schema.rarePlantIdentifications.id, row.id)
  },
  'refresh_tokens.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.refreshTokens)
        .values({
          userId: w.subject,
          tokenHash: `refresh-${w.subject}`,
          expiresAt: new Date(Date.now() + DAY),
        })
        .returning()
    )
    return eq(schema.refreshTokens.id, row.id)
  },
  'rooms.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.rooms)
        .values({ name: 'Bedroom', userId: w.subject })
        .returning()
    )
    return eq(schema.rooms.id, row.id)
  },
  'subscription_events.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.subscriptionEvents)
        .values({ userId: w.subject, eventType: 'subscription_created' })
        .returning()
    )
    return eq(schema.subscriptionEvents.id, row.id)
  },
  'subscription_usage.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.subscriptionUsage)
        .values({
          userId: w.subject,
          periodStart: new Date(Date.now() - DAY),
          periodEnd: new Date(Date.now() + DAY),
        })
        .returning()
    )
    return eq(schema.subscriptionUsage.id, row.id)
  },
  'user_achievements.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.userAchievements)
        .values({ userId: w.subject, achievement: 'FIRST_PLANT_ADDED' })
        .returning()
    )
    return eq(schema.userAchievements.id, row.id)
  },
  'user_follows.follower_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.userFollows)
        .values({ followerId: w.subject, followingId: w.owner })
        .returning()
    )
    return eq(schema.userFollows.id, row.id)
  },
  'user_follows.following_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.userFollows)
        .values({ followerId: w.owner, followingId: w.subject })
        .returning()
    )
    return eq(schema.userFollows.id, row.id)
  },
  'user_nudges.from_user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.userNudges)
        .values({ fromUserId: w.subject, toUserId: w.owner })
        .returning()
    )
    return eq(schema.userNudges.id, row.id)
  },
  'user_nudges.to_user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.userNudges)
        .values({ fromUserId: w.owner, toUserId: w.subject })
        .returning()
    )
    return eq(schema.userNudges.id, row.id)
  },
  'user_subscriptions.user_id': async (db, w) => {
    const row = returned(
      await db
        .insert(schema.userSubscriptions)
        .values({
          userId: w.subject,
          currentPeriodStart: new Date(Date.now() - DAY),
          currentPeriodEnd: new Date(Date.now() + DAY),
        })
        .returning()
    )
    return eq(schema.userSubscriptions.id, row.id)
  },
}

const deadLetter = async (db: Db, userId: string) =>
  returned(
    await db
      .insert(schema.deadLetterMessages)
      .values({
        originalMessageId: `message-${userId}`,
        topic: 'notifications',
        payload: { userId },
        error: 'gave up',
        retryCount: 5,
        userId,
      })
      .returning()
  ).id

const authorizationCode = (db: Db, w: World, userId: string, expiresAt: Date) =>
  db.insert(schema.oauthAuthorizationCodes).values({
    authorizationCode: `code-${userId}`,
    clientId: w.clientId,
    userId,
    redirectUri: 'https://x.test',
    codeChallenge: 'challenge',
    scopes: ['plants:read'],
    expiresAt,
  })

const webhookEvent = (db: Db, userId: string) =>
  db.insert(schema.revenuecatWebhookEvents).values({
    id: `event-${userId}`,
    eventType: 'RENEWAL',
    appUserId: userId,
    environment: 'SANDBOX',
  })

const delegation = async (
  db: Db,
  parties: { readonly ownerId: string; readonly caretakerId: string },
  plantId: string
) => {
  const row = returned(
    await db
      .insert(schema.careDelegations)
      .values({
        ...parties,
        startDate: new Date(Date.now() + DAY),
        endDate: new Date(Date.now() + 7 * DAY),
      })
      .returning()
  )
  await db
    .insert(schema.delegationPlants)
    .values({ delegationId: row.id, plantId })
  return eq(schema.careDelegations.id, row.id)
}

interface ExitPath {
  readonly name: string
  readonly policy: keyof UserDependent
  readonly run: (w: World) => Effect.Effect<unknown, unknown, unknown>
}

const EXITS: ReadonlyArray<ExitPath> = [
  {
    name: 'the deletion request',
    policy: 'release',
    run: (w) => releaseAccount(w.subject),
  },
  { name: 'the purge', policy: 'purge', run: (w) => purgeAccount(w.subject) },
  {
    name: 'leave',
    policy: 'departure',
    run: (w) => Effect.flatMap(Canopy, (c) => c.leave({ by: w.subject })),
  },
  {
    name: 'removal',
    policy: 'departure',
    run: (w) =>
      Effect.flatMap(Canopy, (c) =>
        c.removeMember({ by: w.owner, target: w.subject })
      ),
  },
]

const ON_DELETE: Record<string, string> = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
}

const PURGED_BY: Record<
  Extract<Policy, { readonly _tag: 'Cascade' | 'Reassign' }>['_tag'],
  ReadonlyArray<string>
> = { Cascade: ['c'], Reassign: ['n', 'd'] }

interface Observed {
  readonly present: boolean
  readonly names: boolean
  readonly meets: boolean
}

const conditionOf = (policy: Policy): string =>
  Match.value(policy).pipe(
    Match.tag('Withdraw', (p) => p.withdrawn),
    Match.tag('Keep', (p) => p.live ?? 'true'),
    Match.orElse(() => 'true')
  )

const broken = (
  policy: Policy,
  { present, names, meets }: Observed
): Option.Option<string> =>
  Match.value(policy).pipe(
    Match.tag('Cascade', () =>
      present
        ? Option.some('Cascade wants it gone, it is still there')
        : Option.none()
    ),
    Match.tag('Withdraw', (p) =>
      !present
        ? Option.some(`Withdraw wants it kept with ${p.withdrawn}, it is gone`)
        : meets
          ? Option.none()
          : Option.some(`Withdraw wants ${p.withdrawn}, it is still live`)
    ),
    Match.tag('Reassign', () =>
      !present
        ? Option.some('Reassign wants it kept, it is gone')
        : names
          ? Option.some(
              'Reassign wants it to stop naming the user, it still does'
            )
          : Option.none()
    ),
    Match.tag('Keep', (p) =>
      !present
        ? Option.some(`Keep (${p.reason}) wants it kept, it is gone`)
        : !names
          ? Option.some(
              `Keep (${p.reason}) wants it unchanged, it no longer names the user`
            )
          : meets
            ? Option.none()
            : Option.some(
                `Keep (${p.reason}) wants it still ${p.live}, it no longer is`
              )
    ),
    Match.exhaustive
  )

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Dependents of a user at each exit - Integration',
  () => {
    let pool: pg.Pool
    let db: Db
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof BaseLive>,
      Layer.Error<typeof BaseLive>
    >

    const run = (effect: Effect.Effect<unknown, unknown, unknown>) =>
      runtime.runPromise(
        effect.pipe(
          settled,
          Effect.provide(
            Layer.mergeAll(
              createMockEventBus(),
              NoStoredPhotosLive,
              createMockLimitChecker(),
              createMockMessageQueue(),
              createMockPushService(),
              MockAlerterLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<unknown, unknown, Layer.Success<typeof BaseLive>>
      )

    const reset = () =>
      db.execute(
        sql`TRUNCATE TABLE users, canopies, oauth_clients, gift_codes, revenuecat_webhook_events RESTART IDENTITY CASCADE`
      )

    const user = async (name: string) =>
      returned(
        await db
          .insert(schema.users)
          .values({
            email: `${name}-${crypto.randomUUID()}@example.com`,
            name,
            emailVerified: true,
          })
          .returning()
      ).id

    const plant = async (values: Partial<typeof schema.plants.$inferInsert>) =>
      returned(
        await db
          .insert(schema.plants)
          .values({ ...plantValues, ...values })
          .returning()
      ).id

    const world = async (): Promise<World> => {
      const [subject, owner, third] = [
        await user('Sam'),
        await user('Alex'),
        await user('Lily'),
      ]
      const canopyId = returned(
        await db.insert(schema.canopies).values({ name: 'Home' }).returning()
      ).id
      const members = await db
        .insert(schema.canopyMembers)
        .values([
          { canopyId, userId: owner, role: 'owner' },
          { canopyId, userId: subject, role: 'member' },
        ])
        .returning()
      const clientId = returned(
        await db
          .insert(schema.oauthClients)
          .values({ clientId: 'mcp-client', redirectUris: ['https://x.test'] })
          .returning()
      ).clientId
      const giftCodeId = returned(
        await db
          .insert(schema.giftCodes)
          .values({ code: 'GIFT', duration: '1m', maxUsages: 1 })
          .returning()
      ).id
      return {
        subject,
        owner,
        third,
        canopyId,
        memberId: Option.getOrThrow(
          Array.findFirst(members, (m) => m.userId === subject)
        ).id,
        sharedPlant: await plant({ canopyId, createdByUserId: subject }),
        canopyPlant: await plant({ canopyId, createdByUserId: owner }),
        ownPlant: await plant({ userId: subject }),
        thirdsPlant: await plant({ userId: third }),
        clientId,
        giftCodeId,
      }
    }

    const observe = async (
      column: UserDependentColumn,
      policy: Policy,
      where: SQL,
      subject: string
    ): Promise<Observed> => {
      const [table = '', name = ''] = String.split(column, '.')
      const { rows } = await db.execute<{ names: boolean; meets: boolean }>(
        sql`SELECT ${sql.identifier(name)} IS NOT DISTINCT FROM ${subject}::uuid AS names, (${sql.raw(conditionOf(policy))}) AS meets FROM ${sql.identifier(table)} WHERE ${where}`
      )
      return Option.match(Array.head(rows), {
        onNone: () => ({ present: false, names: false, meets: false }),
        onSome: (row) => ({ present: true, ...row }),
      })
    }

    const tablesNaming = async (userId: string) => {
      const { rows } = await db.execute<{ table: string }>(sql`
        SELECT 'dead_letter_messages' AS "table" FROM dead_letter_messages
        WHERE user_id = ${userId}::uuid OR payload->>'userId' = ${userId}
        UNION ALL
        SELECT 'oauth_authorization_codes' FROM oauth_authorization_codes
        WHERE user_id = ${userId}
        UNION ALL
        SELECT 'revenuecat_webhook_events' FROM revenuecat_webhook_events
        WHERE app_user_id = ${userId}
        ORDER BY 1
      `)
      return Array.map(rows, (row) => row.table)
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      runtime = ManagedRuntime.make(BaseLive)
    })

    afterAll(async () => {
      await reset()
      await runtime.dispose()
      await pool.end()
    })

    it('lists every foreign key to users.id with the ON DELETE its purge policy needs, and every column named like a user id', async () => {
      const { rows } = await db.execute<{ column: string; action: string }>(sql`
        SELECT c.conrelid::regclass::text || '.' || a.attname AS column,
               c.confdeltype AS action
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f' AND c.confrelid = 'public.users'::regclass
      `)
      const actions = Record.fromEntries(
        Array.map(rows, ({ column, action }) => [column, action])
      )
      const named = await db.execute<{ column: string }>(sql`
        SELECT c.table_name || '.' || c.column_name AS column
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND c.column_name ~ '(^|_)user_id$'
      `)
      const unlinked = Array.filter(
        Array.map(named.rows, ({ column }) => column),
        (column) => !(column in actions)
      )
      const registered: Record<string, UserDependent> = USER_DEPENDENTS
      const allowed: Record<string, string> = UNLINKED_USER_COLUMNS

      const problems = Array.getSomes([
        ...Array.map(Record.keys(actions), (column) =>
          column in registered
            ? Option.none()
            : Option.some(
                `${column} references users.id and has no policy in USER_DEPENDENTS (${REGISTRY})`
              )
        ),
        ...Array.map(Record.toEntries(registered), ([column, dependent]) =>
          Option.match(Record.get(actions, column), {
            onNone: () =>
              Option.some(
                `${column} has a policy in USER_DEPENDENTS (${REGISTRY}) but no foreign key to users.id`
              ),
            onSome: (action) =>
              Array.contains(PURGED_BY[dependent.purge._tag], action)
                ? Option.none()
                : Option.some(
                    `${column} purges as ${dependent.purge._tag} in ${REGISTRY}, but its foreign key is ON DELETE ${ON_DELETE[action] ?? action}`
                  ),
          })
        ),
        ...Array.map(unlinked, (column) =>
          column in allowed
            ? Option.none()
            : Option.some(
                `${column} is named like a user id but has no foreign key to users.id. Add the foreign key and its USER_DEPENDENTS entry, or list it in UNLINKED_USER_COLUMNS with why (${REGISTRY})`
              )
        ),
        ...Array.map(Record.keys(allowed), (column) =>
          Array.contains(unlinked, column)
            ? Option.none()
            : Option.some(
                `${column} is in UNLINKED_USER_COLUMNS (${REGISTRY}) but is not a user id column without a foreign key`
              )
        ),
      ])

      expect(problems).toEqual([])
    })

    it.each(EXITS)(
      'holds the policy of every dependent after $name',
      async ({ name, policy, run: exit }) => {
        await reset()
        const w = await world()
        const seeded = await Promise.all(
          Array.map(Record.keys(USER_DEPENDENTS), async (column) => ({
            column,
            where: await SEEDS[column](db, w),
          }))
        )

        await run(exit(w))

        const problems = await Promise.all(
          Array.map(seeded, async ({ column, where }) => {
            const wanted = USER_DEPENDENTS[column][policy]
            const seen = await observe(column, wanted, where, w.subject)
            return Option.map(
              broken(wanted, seen),
              (why) => `${column} after ${name}: ${why}`
            )
          })
        )

        expect(Array.getSomes(problems)).toEqual([])
      }
    )

    it('leaves no row that names the user outside a foreign key after the hourly sweep and the purge, and keeps the rows of another user', async () => {
      await reset()
      const w = await world()
      await deadLetter(db, w.subject)
      await deadLetter(db, w.owner)
      await authorizationCode(db, w, w.subject, new Date(Date.now() - 29 * DAY))
      await authorizationCode(db, w, w.owner, new Date(Date.now() + DAY))
      await webhookEvent(db, w.subject)
      await webhookEvent(db, w.owner)

      await run(deleteExpiredSignInRows)
      await run(purgeAccount(w.subject))

      expect(await tablesNaming(w.subject)).toEqual([])
      expect(await tablesNaming(w.owner)).toEqual([
        'dead_letter_messages',
        'oauth_authorization_codes',
        'revenuecat_webhook_events',
      ])
    })
  }
)
