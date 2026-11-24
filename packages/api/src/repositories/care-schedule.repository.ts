import { isLivingPlant } from '@lily/api/repositories/helpers/living-plant'
import { withCanopyOwner } from '@lily/api/repositories/helpers/plant-owner'
import { isReachableUser } from '@lily/api/repositories/helpers/reachable-user'
import { tending } from '@lily/api/repositories/helpers/tending'
import { hasUserOwner } from '@lily/api/repositories/helpers/user-owner'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopyMembers,
  canopyPlantMutes,
  careDelegations,
  delegationPlants,
  plantCareSchedules,
  plants,
  users,
} from '@lily/db/schema'
import type { PlantOwner } from '@lily/shared'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export type CareScheduleRow = typeof plantCareSchedules.$inferSelect
export type { CareType } from '@lily/shared'

export interface ReminderAudiencePlant {
  id: string
  name: string
  audienceUserId: string
  owner: PlantOwner
  /** Who is addressed: the active caretaker when delegated, else `userId`. */
  recipientId: string
  dateAdded: Date
}

export interface ICareScheduleRepository {
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
}

export class CareScheduleRepository extends Context.Service<
  CareScheduleRepository,
  ICareScheduleRepository
>()('CareScheduleRepository') {}

export const CareScheduleRepositoryLive = Layer.effect(
  CareScheduleRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
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
          .where(tending())
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
    }
  })
)
