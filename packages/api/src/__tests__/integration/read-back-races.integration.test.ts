import { absenceOverStore } from '@lily/api/__tests__/integration/absence-layers'
import {
  canopyOverStore,
  dissolve,
  settled,
} from '@lily/api/__tests__/integration/canopy-layers'
import {
  careOverStore,
  removeAsCurrentUser,
} from '@lily/api/__tests__/integration/care-layers'
import { careDayOf } from '@lily/api/__tests__/integration/care-rows'
import {
  readBehind,
  waitsForALock,
} from '@lily/api/__tests__/integration/lock-waits'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { carePermit } from '@lily/api/__tests__/mocks/care'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockPushService } from '@lily/api/__tests__/mocks/push.service'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { hashInviteToken } from '@lily/api/contexts/canopy/domain/invitation'
import { CareReadsLive } from '@lily/api/contexts/care'
import { ActivityPushTokenRepositoryLive } from '@lily/api/repositories/activity-push-token.repository'
import {
  CanopyRepository,
  CanopyRepositoryLive,
} from '@lily/api/repositories/canopy.repository'
import {
  CareLogRepository,
  CareLogRepositoryLive,
} from '@lily/api/repositories/care-log.repository'
import {
  CarePlanRepository,
  CarePlanRepositoryLive,
} from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import {
  DelegationRepository,
  DelegationRepositoryLive,
} from '@lily/api/repositories/delegation.repository'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  PlantRepositoryLive,
} from '@lily/api/repositories/plant.repository'
import { RefreshTokenRepositoryLive } from '@lily/api/repositories/refresh-token.repository'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { acceptCanopyInvitation } from '@lily/api/services/canopy/endpoints/accept-canopy-invitation'
import { acceptCanopyInvite } from '@lily/api/services/canopy/endpoints/accept-canopy-invite'
import { removeCanopyMember } from '@lily/api/services/canopy/endpoints/remove-canopy-member'
import { sendCanopyInvitation } from '@lily/api/services/canopy/endpoints/send-canopy-invitation'
import { updateMyCanopy } from '@lily/api/services/canopy/endpoints/update-my-canopy'
import { withdrawCanopyInvitation } from '@lily/api/services/canopy/endpoints/withdraw-canopy-invitation'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { deleteCareLog } from '@lily/api/services/care-logs/endpoints/delete-care-log'
import { updateCareLog } from '@lily/api/services/care-logs/endpoints/update-care-log'
import { acceptCarePlan } from '@lily/api/services/care-plans/endpoints/accept-care-plan'
import { completeCarePlanStep } from '@lily/api/services/care-plans/endpoints/complete-care-plan-step'
import { deleteCarePlan } from '@lily/api/services/care-plans/endpoints/delete-care-plan'
import { deleteCarePlanStep } from '@lily/api/services/care-plans/endpoints/delete-care-plan-step'
import { dismissCarePlan } from '@lily/api/services/care-plans/endpoints/dismiss-care-plan'
import { uncompleteCarePlanStep } from '@lily/api/services/care-plans/endpoints/uncomplete-care-plan-step'
import {
  withCarePlanAuth,
  withCarePlanStep,
} from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { cancelDelegation } from '@lily/api/services/delegation/endpoints/cancel-delegation'
import { completeDelegation } from '@lily/api/services/delegation/endpoints/complete-delegation'
import { createDelegation } from '@lily/api/services/delegation/endpoints/create-delegation'
import { respondToDelegation } from '@lily/api/services/delegation/endpoints/respond-delegation'
import { carePlant } from '@lily/api/services/plants/endpoints/care-plant'
import { correctCareDates } from '@lily/api/services/plants/endpoints/correct-care-dates'
import { markPlantDead } from '@lily/api/services/plants/endpoints/mark-plant-dead'
import { revivePlant } from '@lily/api/services/plants/endpoints/revive-plant'
import { sharePlantWithCanopy } from '@lily/api/services/plants/endpoints/share-plant-with-canopy'
import { unsharePlant } from '@lily/api/services/plants/endpoints/unshare-plant'
import { withPermittedPlant } from '@lily/api/services/plants/helpers/with-plant-access'
import { DrizzleLive, PgLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  References,
  Struct,
} from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

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
  NotificationRepositoryLive,
  PlantRepositoryLive,
  RefreshTokenRepositoryLive,
  RoomRepositoryLive,
  UserRepositoryLive
).pipe(Layer.provideMerge(DrizzleLive), Layer.provideMerge(PgLive))

const outcome = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => 'ok',
    onFailure: (cause) =>
      (Cause.squash(cause) as { readonly _tag?: string })._tag ?? 'failed',
  })

type Wrap = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>

interface Seams {
  readonly holdingItsLocks: Wrap
  readonly behindTheRival: Wrap
}

const pausingCare =
  ({ holdingItsLocks }: Seams) =>
  <A, E, R>(endpoint: Effect.Effect<A, E, R>) =>
    Effect.provide(
      endpoint,
      careOverStore((store) => ({
        ...store,
        apply: (writes) => holdingItsLocks(store.apply(writes)),
      }))
    )

const pausingCanopy =
  ({ holdingItsLocks }: Seams) =>
  <A, E, R>(endpoint: Effect.Effect<A, E, R>) =>
    Effect.provide(
      endpoint,
      canopyOverStore((store) => ({
        ...store,
        apply: (writes) => holdingItsLocks(store.apply(writes)),
      }))
    )

const pausingAbsence =
  ({ holdingItsLocks }: Seams) =>
  <A, E, R>(endpoint: Effect.Effect<A, E, R>) =>
    Effect.provide(
      endpoint,
      absenceOverStore((store) => ({
        ...store,
        apply: (writes) => holdingItsLocks(store.apply(writes)),
      }))
    )

const readingThePlantBack =
  ({ behindTheRival }: Seams) =>
  <A, E, R>(endpoint: Effect.Effect<A, E, R>) =>
    Effect.flatMap(PlantRepository, (repo) =>
      Effect.provideService(endpoint, PlantRepository, {
        ...repo,
        findById: (id) => behindTheRival(repo.findById(id)),
      })
    )

const readingTheCareBack =
  ({ behindTheRival }: Seams) =>
  <A, E, R>(endpoint: Effect.Effect<A, E, R>) =>
    Effect.flatMap(CareLogRepository, (repo) =>
      Effect.provideService(endpoint, CareLogRepository, {
        ...repo,
        findById: (id, plantId) => behindTheRival(repo.findById(id, plantId)),
      })
    )

const readingThePlanBack =
  ({ behindTheRival }: Seams) =>
  <A, E, R>(endpoint: Effect.Effect<A, E, R>) =>
    Effect.flatMap(CarePlanRepository, (repo) =>
      Effect.provideService(endpoint, CarePlanRepository, {
        ...repo,
        findById: (id) => behindTheRival(repo.findById(id)),
      })
    )

const readingTheCanopyBack =
  ({ behindTheRival }: Seams) =>
  <A, E, R>(endpoint: Effect.Effect<A, E, R>) =>
    Effect.flatMap(CanopyRepository, (repo) =>
      Effect.provideService(endpoint, CanopyRepository, {
        ...repo,
        findById: (id) => behindTheRival(repo.findById(id)),
      })
    )

const readingTheDelegationBack =
  ({ behindTheRival }: Seams) =>
  <A, E, R>(endpoint: Effect.Effect<A, E, R>) =>
    Effect.flatMap(DelegationRepository, (repo) =>
      Effect.provideService(endpoint, DelegationRepository, {
        ...repo,
        findById: (id) => behindTheRival(repo.findById(id)),
      })
    )

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'An endpoint that answers with what its command wrote - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle<typeof schema>>
    let runtime: ManagedRuntime.ManagedRuntime<
      Layer.Success<typeof BaseLive>,
      Layer.Error<typeof BaseLive>
    >

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      runtime = ManagedRuntime.make(BaseLive)
      await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    const as = <A, E, R>(userId: string, effect: Effect.Effect<A, E, R>) =>
      runtime.runPromiseExit(
        effect.pipe(
          settled,
          Effect.provide(
            Layer.mergeAll(
              createMockCurrentUser({ id: userId, email: `${userId}@x.test` }),
              createMockEventBus(),
              createMockLimitChecker(),
              createMockMessageQueue(),
              createMockPushService(),
              createMockRateLimiterService(),
              MockAlerterLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        ) as Effect.Effect<A, E, Layer.Success<typeof BaseLive>>
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

    const aPlantOf = async (
      owner: { readonly userId: string } | { readonly canopyId: string },
      createdByUserId: string,
      life: { readonly diedAt?: Date } = {}
    ) => {
      const [plant] = await db
        .insert(schema.plants)
        .values({
          ...owner,
          ...life,
          createdByUserId,
          name: 'Fern',
          health: 'HEALTHY',
          humidityRating: 3,
          lightingRating: 3,
          petToxicityRating: 1,
          wateringRating: 3,
        })
        .returning()
      if (!plant) throw new Error('plant insert returned nothing')
      const dueAt = new Date(Date.now() + 3 * DAY)
      await db.insert(schema.plantCareSchedules).values({
        plantId: plant.id,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: dueAt,
        dueDay: careDayOf(dueAt),
      })
      return plant.id
    }

    const aCareOf = async (plantId: string, by: string) => {
      const date = new Date(Date.now() - 2 * DAY)
      const [log] = await db
        .insert(schema.careLogs)
        .values({
          plantId,
          type: 'watering',
          date,
          careDay: careDayOf(date),
          performedByUserId: by,
        })
        .returning()
      if (!log) throw new Error('care log insert returned nothing')
      return log.id
    }

    const aPlanOn = async (
      plantId: string,
      author: string,
      status: 'proposed' | 'accepted',
      step: { readonly completedAt?: Date } = {}
    ) => {
      const [plan] = await db
        .insert(schema.carePlans)
        .values({ plantId, userId: author, title: 'Rescue', status })
        .returning()
      if (!plan) throw new Error('plan insert returned nothing')
      const [first] = await db
        .insert(schema.carePlanSteps)
        .values([
          { planId: plan.id, position: 0, title: 'Move to shade', ...step },
          { planId: plan.id, position: 1, title: 'Wait a week' },
        ])
        .returning()
      if (!first) throw new Error('step insert returned nothing')
      return { planId: plan.id, stepId: first.id }
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
      return canopy.id
    }

    const anInvitationTo = async (
      canopyId: string,
      invitee: string,
      inviter: string
    ) => {
      const [invitation] = await db
        .insert(schema.canopyDirectInvites)
        .values({
          canopyId,
          inviteeUserId: invitee,
          invitedByUserId: inviter,
          expiresAt: new Date(Date.now() + 7 * DAY),
        })
        .returning()
      if (!invitation) throw new Error('invitation insert returned nothing')
      return invitation.id
    }

    const aDelegationOf = async (
      status: 'pending' | 'active',
      startDate: Date
    ) => {
      const { owner, plantId } = await aPlantOfItsOwner()
      const caretaker = await aUser()
      const [delegation] = await db
        .insert(schema.careDelegations)
        .values({
          ownerId: owner,
          caretakerId: caretaker,
          status,
          startDate,
          endDate: new Date(Date.now() + 30 * DAY),
        })
        .returning()
      if (!delegation) throw new Error('delegation insert returned nothing')
      await db
        .insert(schema.delegationPlants)
        .values({ delegationId: delegation.id, plantId })
      return { owner, caretaker, delegationId: delegation.id }
    }

    const deletedByAnotherSession = (plantId: string) =>
      Effect.promise(() =>
        pool.query('DELETE FROM plants WHERE id = $1', [plantId])
      )

    const delegationDeletedByAnotherSession = (delegationId: string) =>
      Effect.promise(() =>
        pool.query('DELETE FROM care_delegations WHERE id = $1', [delegationId])
      )

    const accountDeletedByAnotherSession = (userId: string) =>
      Effect.promise(() =>
        pool.query('DELETE FROM users WHERE id = $1', [userId])
      )

    interface Race {
      readonly asker: string
      readonly endpoint: (
        seams: Seams
      ) => Effect.Effect<unknown, unknown, unknown>
      readonly rival: Effect.Effect<unknown, unknown, unknown>
    }

    const aPlantOfItsOwner = async (life: { readonly diedAt?: Date } = {}) => {
      const owner = await aUser()
      return { owner, plantId: await aPlantOf({ userId: owner }, owner, life) }
    }

    const onAPlant = async (
      endpoint: (plantId: string, owner: string) => Race['endpoint']
    ): Promise<Race> => {
      const { owner, plantId } = await aPlantOfItsOwner()
      return {
        asker: owner,
        endpoint: endpoint(plantId, owner),
        rival: removeAsCurrentUser(plantId),
      }
    }

    const onAPlan = async (
      status: 'proposed' | 'accepted',
      endpoint: (plan: {
        readonly planId: string
        readonly stepId: string
      }) => Race['endpoint'],
      step: { readonly completedAt?: Date } = {}
    ): Promise<Race> => {
      const { owner, plantId } = await aPlantOfItsOwner()
      const plan = await aPlanOn(plantId, owner, status, step)
      return {
        asker: owner,
        endpoint: endpoint(plan),
        rival: withCarePlanAuth(plan.planId, 'manage').pipe(
          Effect.flatMap(deleteCarePlan)
        ),
      }
    }

    const RACES = {
      'a new care log': () =>
        onAPlant(
          (plantId, owner) => (seams) =>
            createCareLog(carePermit(plantId, owner), {
              type: 'watering',
            }).pipe(readingTheCareBack(seams), pausingCare(seams))
        ),
      'an edited care log, against its removal': async () => {
        const { owner, plantId } = await aPlantOfItsOwner()
        const logId = await aCareOf(plantId, owner)
        const permit = carePermit(plantId, owner)
        return {
          asker: owner,
          endpoint: (seams) =>
            updateCareLog(permit, logId, { notes: 'Deep soak' }).pipe(
              readingTheCareBack(seams),
              pausingCare(seams)
            ),
          rival: deleteCareLog(permit, logId),
        }
      },
      'a cared plant': () =>
        onAPlant(
          (plantId, owner) => (seams) =>
            carePlant(carePermit(plantId, owner), {
              careType: 'watering',
            }).pipe(readingThePlantBack(seams), pausingCare(seams))
        ),
      'a plant with a corrected care date': () =>
        onAPlant(
          (plantId, owner) => (seams) =>
            correctCareDates(carePermit(plantId, owner), {
              lastWateredAt: new Date(Date.now() - 2 * DAY),
            }).pipe(readingThePlantBack(seams), pausingCare(seams))
        ),
      'a buried plant': () =>
        onAPlant(
          (plantId) => (seams) =>
            withPermittedPlant(plantId, 'markDead').pipe(
              Effect.flatMap(({ plant, permit }) =>
                markPlantDead(plant, permit, { cause: 'unknown' }).pipe(
                  readingThePlantBack(seams),
                  pausingCare(seams)
                )
              )
            )
        ),
      'a revived plant': async () => {
        const { owner, plantId } = await aPlantOfItsOwner({
          diedAt: new Date(Date.now() - DAY),
        })
        return {
          asker: owner,
          endpoint: (seams) =>
            withPermittedPlant(plantId, 'revive').pipe(
              Effect.flatMap(({ plant, permit }) =>
                revivePlant(plant, permit).pipe(
                  readingThePlantBack(seams),
                  pausingCare(seams)
                )
              )
            ),
          rival: removeAsCurrentUser(plantId),
        }
      },
      'a plant shared with the canopy': async () => {
        const { owner, plantId } = await aPlantOfItsOwner()
        await aCanopyOf(owner)
        return {
          asker: owner,
          endpoint: (seams) =>
            withPermittedPlant(plantId, 'share').pipe(
              Effect.flatMap(({ permit }) =>
                sharePlantWithCanopy(permit, {}).pipe(
                  readingThePlantBack(seams),
                  pausingCanopy(seams)
                )
              )
            ),
          rival: deletedByAnotherSession(plantId),
        }
      },
      'a plant taken back from the canopy': async () => {
        const owner = await aUser()
        const canopyId = await aCanopyOf(owner)
        const plantId = await aPlantOf({ canopyId }, owner)
        return {
          asker: owner,
          endpoint: (seams) =>
            withPermittedPlant(plantId, 'unshare').pipe(
              Effect.flatMap(({ permit }) =>
                unsharePlant(permit, {}).pipe(
                  readingThePlantBack(seams),
                  pausingCanopy(seams)
                )
              )
            ),
          rival: deletedByAnotherSession(plantId),
        }
      },
      'an accepted plan': () =>
        onAPlan(
          'proposed',
          ({ planId }) =>
            (seams) =>
              withCarePlanAuth(planId, 'manage').pipe(
                Effect.flatMap((plan) =>
                  acceptCarePlan(plan).pipe(
                    readingThePlanBack(seams),
                    pausingCare(seams)
                  )
                )
              )
        ),
      'a dismissed plan': () =>
        onAPlan(
          'proposed',
          ({ planId }) =>
            (seams) =>
              withCarePlanAuth(planId, 'manage').pipe(
                Effect.flatMap((plan) =>
                  dismissCarePlan(plan).pipe(
                    readingThePlanBack(seams),
                    pausingCare(seams)
                  )
                )
              )
        ),
      'a plan with a ticked step': () =>
        onAPlan(
          'accepted',
          ({ planId, stepId }) =>
            (seams) =>
              withCarePlanStep(planId, stepId, 'tick').pipe(
                Effect.flatMap((step) =>
                  completeCarePlanStep(step).pipe(
                    readingThePlanBack(seams),
                    pausingCare(seams)
                  )
                )
              )
        ),
      'a plan with an unticked step': () =>
        onAPlan(
          'accepted',
          ({ planId, stepId }) =>
            (seams) =>
              withCarePlanStep(planId, stepId, 'tick').pipe(
                Effect.flatMap((step) =>
                  uncompleteCarePlanStep(step).pipe(
                    readingThePlanBack(seams),
                    pausingCare(seams)
                  )
                )
              ),
          { completedAt: new Date(Date.now() - DAY) }
        ),
      'a plan with a dropped step': () =>
        onAPlan(
          'accepted',
          ({ planId, stepId }) =>
            (seams) =>
              withCarePlanStep(planId, stepId, 'manage').pipe(
                Effect.flatMap((step) =>
                  deleteCarePlanStep(step).pipe(
                    readingThePlanBack(seams),
                    pausingCare(seams)
                  )
                )
              )
        ),
      'a renamed canopy': async () => {
        const owner = await aUser()
        await aCanopyOf(owner)
        return {
          asker: owner,
          endpoint: (seams) =>
            updateMyCanopy({ name: 'Greenhouse' }).pipe(
              readingTheCanopyBack(seams),
              pausingCanopy(seams)
            ),
          rival: dissolve(owner),
        }
      },
      'a canopy with a withdrawn invitation': async () => {
        const owner = await aUser()
        const invitee = await aUser()
        const canopyId = await aCanopyOf(owner)
        const invitationId = await anInvitationTo(canopyId, invitee, owner)
        return {
          asker: owner,
          endpoint: (seams) =>
            withdrawCanopyInvitation(invitationId).pipe(
              readingTheCanopyBack(seams),
              pausingCanopy(seams)
            ),
          rival: dissolve(owner),
        }
      },
      'a canopy joined by its link': async () => {
        const owner = await aUser()
        const joiner = await aUser()
        const canopyId = await aCanopyOf(owner)
        const token = `link-${crypto.randomUUID()}`
        await db.insert(schema.canopyInvites).values({
          canopyId,
          tokenHash: hashInviteToken(token),
          createdByUserId: owner,
          expiresAt: new Date(Date.now() + 7 * DAY),
        })
        return {
          asker: joiner,
          endpoint: (seams) =>
            acceptCanopyInvite(token).pipe(
              readingTheCanopyBack(seams),
              pausingCanopy(seams)
            ),
          rival: dissolve(owner),
        }
      },
      'a canopy joined by an invitation': async () => {
        const owner = await aUser()
        const joiner = await aUser()
        const canopyId = await aCanopyOf(owner)
        const invitationId = await anInvitationTo(canopyId, joiner, owner)
        return {
          asker: joiner,
          endpoint: (seams) =>
            acceptCanopyInvitation(invitationId).pipe(
              readingTheCanopyBack(seams),
              pausingCanopy(seams)
            ),
          rival: dissolve(owner),
        }
      },
      'a canopy with a removed member': async () => {
        const owner = await aUser()
        const member = await aUser()
        await aCanopyOf(owner, member)
        return {
          asker: owner,
          endpoint: (seams) =>
            removeCanopyMember(member).pipe(
              readingTheCanopyBack(seams),
              pausingCanopy(seams)
            ),
          rival: dissolve(owner),
        }
      },
      'a canopy with a new invitation': async () => {
        const owner = await aUser()
        const invitee = await aUser()
        await aCanopyOf(owner)
        return {
          asker: owner,
          endpoint: (seams) =>
            sendCanopyInvitation(invitee).pipe(
              readingTheCanopyBack(seams),
              pausingCanopy(seams)
            ),
          rival: dissolve(owner),
        }
      },
      'a new delegation, against the deletion of its caretaker': async () => {
        const { owner, plantId } = await aPlantOfItsOwner()
        const caretaker = await aUser()
        return {
          asker: owner,
          endpoint: (seams) =>
            createDelegation({
              caretakerId: caretaker,
              plantIds: [plantId],
              startDate: new Date(Date.now() + DAY).toISOString(),
              endDate: new Date(Date.now() + 8 * DAY).toISOString(),
            }).pipe(readingTheDelegationBack(seams), pausingAbsence(seams)),
          rival: accountDeletedByAnotherSession(caretaker),
        }
      },
      'a canceled delegation': async () => {
        const { owner, delegationId } = await aDelegationOf(
          'pending',
          new Date(Date.now() + DAY)
        )
        return {
          asker: owner,
          endpoint: (seams) =>
            cancelDelegation(delegationId).pipe(
              readingTheDelegationBack(seams),
              pausingAbsence(seams)
            ),
          rival: delegationDeletedByAnotherSession(delegationId),
        }
      },
      'a delegation its caretaker accepted': async () => {
        const { caretaker, delegationId } = await aDelegationOf(
          'pending',
          new Date(Date.now() + DAY)
        )
        return {
          asker: caretaker,
          endpoint: (seams) =>
            respondToDelegation(delegationId, { accept: true }).pipe(
              readingTheDelegationBack(seams),
              pausingAbsence(seams)
            ),
          rival: delegationDeletedByAnotherSession(delegationId),
        }
      },
      'a delegation completed early': async () => {
        const { owner, delegationId } = await aDelegationOf(
          'active',
          new Date(Date.now() - DAY)
        )
        return {
          asker: owner,
          endpoint: (seams) =>
            completeDelegation(delegationId).pipe(
              readingTheDelegationBack(seams),
              pausingAbsence(seams)
            ),
          rival: delegationDeletedByAnotherSession(delegationId),
        }
      },
    } satisfies Record<string, () => Promise<Race>>

    it.each(Struct.keys(RACES))(
      'answers with %s when a delete of it waits for the command',
      async (what) => {
        const race: Race = await RACES[what]()
        const reached = Deferred.makeUnsafe<void>()
        const release = Deferred.makeUnsafe<void>()
        const rivalDone = Deferred.makeUnsafe<void>()

        const answering = as(
          race.asker,
          Effect.flatMap(readBehind(rivalDone), (behindTheRival) =>
            race.endpoint({
              behindTheRival,
              holdingItsLocks: (step) =>
                Deferred.succeed(reached, undefined).pipe(
                  Effect.andThen(Deferred.await(release)),
                  Effect.andThen(step)
                ),
            })
          )
        )
        await Effect.runPromise(Deferred.await(reached))
        const deleting = as(race.asker, race.rival)
        void deleting.then(() => Deferred.doneUnsafe(rivalDone, Exit.void))
        const deleteWaited = await waitsForALock(pool, deleting)
        Deferred.doneUnsafe(release, Exit.void)

        expect({
          answered: outcome(await answering),
          deleted: outcome(await deleting),
          deleteWaited,
        }).toEqual({ answered: 'ok', deleted: 'ok', deleteWaited: true })
      }
    )
  }
)
