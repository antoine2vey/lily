import {
  type CareEntry,
  type CareLine,
  type CarePlant,
  frequencyOfDays,
  LifeState,
  type Schedule,
} from '@lily/api/contexts/care/domain/care-plant'
import type { AccountsHeld } from '@lily/api/contexts/care/domain/decide'
import type { Plan, PlanStep } from '@lily/api/contexts/care/domain/plan'
import { seePlantCare } from '@lily/api/contexts/care/plant-care'
import { lockRowsNamed, pinAccounts } from '@lily/api/kernel/locks'
import { careTimezoneSql } from '@lily/api/repositories/helpers/care-timezone'
import { ownerOf } from '@lily/api/repositories/helpers/plant-owner'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopies,
  careLogs,
  carePlanSteps,
  carePlans,
  plantCareSchedules,
  plants,
  users,
} from '@lily/db/schema'
import {
  CARE_TYPES,
  CareDay,
  CareDays,
  type CareType,
  type PlantOwner,
} from '@lily/shared'
import { and, eq, inArray } from 'drizzle-orm'
import {
  Array,
  DateTime,
  Effect,
  Match,
  Option,
  Order,
  pipe,
  Record,
} from 'effect'

export interface ActedOn {
  readonly plants: ReadonlyMap<string, CarePlant>
  readonly accountsHeld: AccountsHeld
}

export interface PlantingGround {
  readonly timezone: string
  readonly accountsHeld: AccountsHeld
}

type ScheduleRow = typeof plantCareSchedules.$inferSelect

const toSchedule = (row: ScheduleRow, timezone: string): Schedule => {
  const startedOn = CareDays.of(DateTime.makeUnsafe(row.createdAt), timezone)
  return {
    frequency: frequencyOfDays(row.frequencyDays),
    dueDay: CareDay.make(row.dueDay),
    startedOn,
  }
}

const latestFirst = Order.mapInput(
  Order.flip(Order.Date),
  (row: { readonly date: Date }) => row.date
)

const toHistory = (
  rows: ReadonlyArray<{
    readonly id: string
    readonly date: Date
    readonly careDay: string
    readonly performedByUserId: string | null
  }>
): ReadonlyArray<CareEntry> =>
  pipe(
    rows,
    Array.sort(latestFirst),
    Array.map(
      (row): CareEntry => ({
        id: row.id,
        day: CareDay.make(row.careDay),
        by: Option.fromNullishOr(row.performedByUserId),
      })
    )
  )

export type PlantRowLock = 'no key update' | 'update'

interface PlanStepRow {
  readonly planId: string
  readonly plantId: string
  readonly status: Plan['status']
  readonly createdAt: Date
  readonly stepId: string | null
  readonly position: number | null
  readonly careType: CareType | null
  readonly dueDate: Date | null
  readonly completedAt: Date | null
}

const toPlans = (rows: ReadonlyArray<PlanStepRow>): ReadonlyArray<Plan> =>
  pipe(
    Array.groupBy(rows, (row) => row.planId),
    Record.values,
    Array.map(
      (ofPlan): Plan => ({
        id: Array.headNonEmpty(ofPlan).planId,
        status: Array.headNonEmpty(ofPlan).status,
        createdAt: DateTime.makeUnsafe(Array.headNonEmpty(ofPlan).createdAt),
        steps: Array.flatMap(
          ofPlan,
          (row): ReadonlyArray<PlanStep> =>
            row.stepId === null || row.position === null
              ? []
              : [
                  {
                    id: row.stepId,
                    position: row.position,
                    careType: Option.fromNullishOr(row.careType),
                    dueAt: Option.map(
                      Option.fromNullishOr(row.dueDate),
                      DateTime.makeUnsafe
                    ),
                    done: row.completedAt !== null,
                  },
                ]
        ),
      })
    )
  )

export const makeLocks = Effect.gen(function* () {
  const db = yield* PgDrizzle.PgDrizzle

  const lockAndLoad = Effect.fn('CareStore.lockAndLoad')(function* (
    plantIds: ReadonlyArray<string>,
    careTypes: ReadonlyArray<CareType>,
    lock: PlantRowLock = 'no key update'
  ) {
    if (Array.isReadonlyArrayEmpty(plantIds)) {
      return new Map<string, CarePlant>()
    }
    const ids = [...plantIds]
    const locked = yield* lockRowsNamed(
      'Plant',
      lock,
      ids,
      db
        .select({
          id: plants.id,
          userId: plants.userId,
          canopyId: plants.canopyId,
          health: plants.health,
          diedAt: plants.diedAt,
          timezone: careTimezoneSql,
        })
        .from(plants)
        .where(inArray(plants.id, ids))
    )
    const scheduleRows = yield* db
      .select()
      .from(plantCareSchedules)
      .where(inArray(plantCareSchedules.plantId, ids))
    const careRows = Array.isReadonlyArrayEmpty(careTypes)
      ? []
      : yield* db
          .select({
            id: careLogs.id,
            plantId: careLogs.plantId,
            careType: careLogs.type,
            date: careLogs.date,
            careDay: careLogs.careDay,
            performedByUserId: careLogs.performedByUserId,
          })
          .from(careLogs)
          .where(
            and(
              inArray(careLogs.plantId, ids),
              inArray(careLogs.type, [...careTypes])
            )
          )
    const planRows = yield* db
      .select({
        planId: carePlans.id,
        plantId: carePlans.plantId,
        status: carePlans.status,
        createdAt: carePlans.createdAt,
        stepId: carePlanSteps.id,
        position: carePlanSteps.position,
        careType: carePlanSteps.careType,
        dueDate: carePlanSteps.dueDate,
        completedAt: carePlanSteps.completedAt,
      })
      .from(carePlans)
      .leftJoin(carePlanSteps, eq(carePlanSteps.planId, carePlans.id))
      .where(inArray(carePlans.plantId, ids))

    const now = yield* DateTime.now
    return new Map(
      Array.map(locked, (row): readonly [string, CarePlant] => {
        const schedules = Array.filter(
          scheduleRows,
          (s) => s.plantId === row.id
        )
        const seen = seePlantCare(
          row,
          Array.map(schedules, (s) => ({
            ...s,
            dueDay: CareDay.make(s.dueDay),
          })),
          row.timezone,
          now
        )
        const lineOf = (careType: CareType): CareLine => ({
          careType,
          schedule: pipe(
            Array.findFirst(schedules, (s) => s.careType === careType),
            Option.map((s) => toSchedule(s, row.timezone))
          ),
          history: toHistory(
            Array.filter(
              careRows,
              (c) => c.plantId === row.id && c.careType === careType
            )
          ),
        })
        return [
          row.id,
          {
            id: row.id,
            owner: ownerOf(row),
            life: row.diedAt === null ? LifeState.Living() : LifeState.Dead(),
            timezone: row.timezone,
            today: seen.today,
            needsAttention: seen.health === 'NEEDS_ATTENTION',
            lines: new Map(
              Array.map(
                Array.filter(CARE_TYPES, (t) => Array.contains(careTypes, t)),
                (careType) => [careType, lineOf(careType)]
              )
            ),
            plans: toPlans(
              Array.filter(planRows, (plan) => plan.plantId === row.id)
            ),
          },
        ]
      })
    )
  })

  const holdAccounts = (userIds: ReadonlyArray<string>) =>
    Array.isReadonlyArrayEmpty(userIds)
      ? Effect.succeed(new Set<string>())
      : Effect.map(
          pinAccounts(
            db
              .select({ id: users.id })
              .from(users)
              .where(inArray(users.id, [...userIds]))
          ),
          (rows) => new Set(Array.map(rows, (row) => row.id))
        )

  return {
    lockAndLoadForPlanting: Effect.fn('CareStore.lockAndLoadForPlanting')(
      function* (userIds: ReadonlyArray<string>, owner: PlantOwner) {
        const accountsHeld = yield* holdAccounts(userIds)
        const stored: ReadonlyArray<string | null> = yield* Match.value(
          owner
        ).pipe(
          Match.tagsExhaustive({
            User: ({ userId }) =>
              Effect.map(
                db
                  .select({ timezone: users.timezone })
                  .from(users)
                  .where(eq(users.id, userId)),
                Array.map((row) => row.timezone)
              ),
            Canopy: ({ canopyId }) =>
              Effect.map(
                db
                  .select({ timezone: canopies.timezone })
                  .from(canopies)
                  .where(eq(canopies.id, canopyId)),
                Array.map((row) => row.timezone)
              ),
          })
        )
        const timezone = pipe(
          Array.head(stored),
          Option.flatMap(Option.fromNullishOr),
          Option.getOrElse(() => 'UTC')
        )
        return { timezone, accountsHeld }
      }
    ),

    lockAndLoad,

    lockAndLoadFor: Effect.fn('CareStore.lockAndLoadFor')(function* (
      actorIds: ReadonlyArray<string>,
      plantIds: ReadonlyArray<string>,
      careTypes: ReadonlyArray<CareType>
    ) {
      const plants = yield* lockAndLoad(plantIds, careTypes)
      return { plants, accountsHeld: yield* holdAccounts(actorIds) }
    }),
  }
})
