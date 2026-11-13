import {
  caredForBy,
  memberCanopyIdOf,
} from '@lily/api/repositories/helpers/care-visibility'
import { isLivingPlant } from '@lily/api/repositories/helpers/living-plant'
import {
  ownerOf,
  withCanopyOwner,
} from '@lily/api/repositories/helpers/plant-owner'
import { isReachableUser } from '@lily/api/repositories/helpers/reachable-user'
import { hasUserOwner } from '@lily/api/repositories/helpers/user-owner'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopyMembers,
  canopyPlantMutes,
  careDelegations,
  delegationPlants,
  plantCareSchedules,
  plants,
  rooms,
  users,
} from '@lily/db/schema'
import type { CareType, PlantOwner } from '@lily/shared'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// Types
export type CareScheduleRow = typeof plantCareSchedules.$inferSelect
export type { CareType } from '@lily/shared'

export interface OwnerScheduleRow {
  schedule: CareScheduleRow
  plant: {
    id: string
    owner: PlantOwner
    remindersEnabled: boolean
  }
}

export interface ReminderAudiencePlant {
  id: string
  name: string
  audienceUserId: string
  owner: PlantOwner
  /** Who is addressed: the active caretaker when delegated, else `userId`. */
  recipientId: string
  dateAdded: Date
}

export interface UpsertScheduleData {
  frequencyDays: number
  lastCareAt?: Date | null
  nextCareAt?: Date | null
}

// Repository interface
export interface ICareScheduleRepository {
  readonly findByPlantAndType: (
    plantId: string,
    careType: CareType
  ) => Effect.Effect<CareScheduleRow | null, SqlError>
  readonly findByPlant: (
    plantId: string
  ) => Effect.Effect<Array<CareScheduleRow>, SqlError>
  /**
   * Who gets care reminders for these plants, grouped by audience member.
   * Living plants with reminders enabled only; reachable users only.
   */
  readonly findReminderAudience: (
    plantIds: ReadonlyArray<string>
  ) => Effect.Effect<Record<string, Array<ReminderAudiencePlant>>, SqlError>
  readonly findByOwnerWithPlant: (
    userId: string
  ) => Effect.Effect<Array<OwnerScheduleRow>, SqlError>
}

// Tag for dependency injection
export class CareScheduleRepository extends Context.Service<
  CareScheduleRepository,
  ICareScheduleRepository
>()('CareScheduleRepository') {}

// Shared room selection shape for joins
const _roomSelect = {
  id: rooms.id,
  name: rooms.name,
  icon: rooms.icon,
}

// Live implementation
export const CareScheduleRepositoryLive = Layer.effect(
  CareScheduleRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findByPlantAndType: Effect.fn(
        'CareScheduleRepository.findByPlantAndType'
      )(function* (plantId: string, careType: CareType) {
        const [row] = yield* db
          .select()
          .from(plantCareSchedules)
          .where(
            and(
              eq(plantCareSchedules.plantId, plantId),
              eq(plantCareSchedules.careType, careType)
            )
          )
        return pipe(Option.fromNullishOr(row), Option.getOrNull)
      }),

      findByPlant: Effect.fn('CareScheduleRepository.findByPlant')(function* (
        plantId: string
      ) {
        const rows = yield* db
          .select()
          .from(plantCareSchedules)
          .where(eq(plantCareSchedules.plantId, plantId))
        return rows
      }),

      findReminderAudience: Effect.fn(
        'CareScheduleRepository.findReminderAudience'
      )(function* (plantIds: ReadonlyArray<string>) {
        if (Array.isReadonlyArrayEmpty(plantIds)) return {}
        const remindable = and(
          inArray(plants.id, [...plantIds]),
          isLivingPlant(),
          eq(plants.remindersEnabled, true),
          isReachableUser()
        )
        const activeCaretakers = db
          .select({
            plantId: delegationPlants.plantId,
            caretakerId: careDelegations.caretakerId,
          })
          .from(delegationPlants)
          .innerJoin(
            careDelegations,
            eq(careDelegations.id, delegationPlants.delegationId)
          )
          .innerJoin(users, eq(users.id, careDelegations.caretakerId))
          .where(and(eq(careDelegations.status, 'active'), isReachableUser()))
          .as('active_caretakers')
        const personal = yield* db
          .select({
            plantId: plants.id,
            plantName: plants.name,
            userId: plants.userId,
            caretakerId: activeCaretakers.caretakerId,
            dateAdded: plants.dateAdded,
          })
          .from(plants)
          .leftJoin(activeCaretakers, eq(activeCaretakers.plantId, plants.id))
          .innerJoin(
            users,
            eq(
              users.id,
              sql`coalesce(${activeCaretakers.caretakerId}, ${plants.userId})`
            )
          )
          .where(remindable)

        const shared = yield* db
          .select({
            plantId: plants.id,
            plantName: plants.name,
            userId: canopyMembers.userId,
            canopyId: canopyMembers.canopyId,
            dateAdded: plants.dateAdded,
          })
          .from(plants)
          .innerJoin(canopyMembers, eq(plants.canopyId, canopyMembers.canopyId))
          .innerJoin(users, eq(users.id, canopyMembers.userId))
          .leftJoin(
            canopyPlantMutes,
            and(
              eq(canopyPlantMutes.userId, canopyMembers.userId),
              eq(canopyPlantMutes.plantId, plants.id)
            )
          )
          .where(and(remindable, isNull(canopyPlantMutes.userId)))

        const audience = Array.appendAll(
          Array.map(
            Array.filter(personal, hasUserOwner),
            (r): ReminderAudiencePlant => ({
              id: r.plantId,
              name: r.plantName,
              audienceUserId: r.userId,
              owner: { _tag: 'User', userId: r.userId },
              recipientId: pipe(
                Option.fromNullishOr(r.caretakerId),
                Option.getOrElse(() => r.userId)
              ),
              dateAdded: r.dateAdded,
            })
          ),
          Array.map(
            shared,
            (r): ReminderAudiencePlant => ({
              id: r.plantId,
              name: r.plantName,
              audienceUserId: r.userId,
              owner: withCanopyOwner({ ...r, userId: null }).owner,
              recipientId: r.userId,
              dateAdded: r.dateAdded,
            })
          )
        )
        return Array.groupBy(
          Array.dedupeWith(
            audience,
            (a, b) => a.audienceUserId === b.audienceUserId && a.id === b.id
          ),
          (p) => p.audienceUserId
        )
      }),

      findByOwnerWithPlant: Effect.fn(
        'CareScheduleRepository.findByOwnerWithPlant'
      )(function* (userId: string) {
        const canopyId = yield* memberCanopyIdOf(db, userId)
        const rows = yield* db
          .select({
            schedule: plantCareSchedules,
            plant: {
              id: plants.id,
              userId: plants.userId,
              canopyId: plants.canopyId,
              remindersEnabled: plants.remindersEnabled,
            },
          })
          .from(plantCareSchedules)
          .innerJoin(plants, eq(plantCareSchedules.plantId, plants.id))
          .where(and(caredForBy(db, userId, canopyId), isLivingPlant()))
        return Array.map(rows, (row) => ({
          schedule: row.schedule,
          plant: {
            id: row.plant.id,
            owner: ownerOf(row.plant),
            remindersEnabled: row.plant.remindersEnabled,
          },
        }))
      }),
    }
  })
)
