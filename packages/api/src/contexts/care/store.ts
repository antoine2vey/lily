import {
  type CareEntry,
  type CareLine,
  type CarePlant,
  frequencyOfDays,
  LifeState,
  type Schedule,
} from '@lily/api/contexts/care/domain/care-plant'
import {
  type AccountsHeld,
  CareWrite,
} from '@lily/api/contexts/care/domain/decide'
import type { Plan, PlanStep } from '@lily/api/contexts/care/domain/plan'
import { seePlantCare } from '@lily/api/contexts/care/plant-care'
import { storedDay } from '@lily/api/contexts/care/stored-day'
import type { Transaction } from '@lily/api/kernel/transact'
import { careTimezoneSql } from '@lily/api/repositories/helpers/care-timezone'
import {
  ownerColumns,
  ownerOf,
} from '@lily/api/repositories/helpers/plant-owner'
import type { PlantForAdjustment } from '@lily/api/services/weather/algorithm'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopies,
  careLogs,
  carePlanSteps,
  carePlans,
  plantCareSchedules,
  plants,
  rooms,
  users,
} from '@lily/db/schema'
import {
  CARE_TYPES,
  CareDays,
  type CareType,
  type PlantOwner,
} from '@lily/shared'
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import {
  Array,
  Context,
  Data,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  Order,
  pipe,
  Record,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface CareLogKey {
  readonly plantId: string
  readonly careType: CareType
}

export interface WeatherProfile {
  readonly latitude: number
  readonly longitude: number
  readonly plant: PlantForAdjustment
}

export interface ActedOn {
  readonly plants: ReadonlyMap<string, CarePlant>
  readonly accountsHeld: AccountsHeld
}

export interface PlantingGround {
  readonly timezone: string
  readonly accountsHeld: AccountsHeld
}

const DEFAULT_WATERING_FREQUENCY_DAYS = 7

export class CareStore extends Context.Service<
  CareStore,
  {
    readonly careLogKey: (
      careLogId: string
    ) => Effect.Effect<Option.Option<CareLogKey>, SqlError>
    readonly careTypesOfPlan: (
      planId: string
    ) => Effect.Effect<ReadonlyArray<CareType>, SqlError>
    readonly lockAndLoadForPlanting: (
      userIds: ReadonlyArray<string>,
      owner: PlantOwner
    ) => Effect.Effect<PlantingGround, SqlError, Transaction>
    readonly lockAndLoad: (
      plantIds: ReadonlyArray<string>,
      careTypes: ReadonlyArray<CareType>,
      lock?: PlantRowLock
    ) => Effect.Effect<ReadonlyMap<string, CarePlant>, SqlError, Transaction>
    /**
     * `lockAndLoad`, then the account rows of `actorIds` `FOR KEY SHARE` in id
     * order. A row that names a user takes that lock through its foreign key
     * anyway. Taking it at the load makes a deleted account a fact the
     * command refuses on, where the write would break the constraint.
     */
    readonly lockAndLoadFor: (
      actorIds: ReadonlyArray<string>,
      plantIds: ReadonlyArray<string>,
      careTypes: ReadonlyArray<CareType>
    ) => Effect.Effect<ActedOn, SqlError, Transaction>
    readonly apply: (
      writes: ReadonlyArray<CareWrite>
    ) => Effect.Effect<void, SqlError, Transaction>
    readonly weatherProfiles: (
      plantIds: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyArray<WeatherProfile>, SqlError>
    readonly linkPlanToMessage: (
      planId: string,
      chatMessageId: string
    ) => Effect.Effect<void, SqlError>
  }
>()('care/CareStore') {}

type ScheduleRow = typeof plantCareSchedules.$inferSelect

const toSchedule = (row: ScheduleRow, timezone: string): Schedule => {
  const startedOn = CareDays.of(DateTime.makeUnsafe(row.createdAt), timezone)
  return {
    frequency: frequencyOfDays(row.frequencyDays),
    dueDay: storedDay(row.dueDay, row.nextCareAt, timezone),
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
    readonly careDay: string | null
  }>,
  timezone: string
): ReadonlyArray<CareEntry> =>
  pipe(
    rows,
    Array.sort(latestFirst),
    Array.map(
      (row): CareEntry => ({
        id: row.id,
        day: storedDay(row.careDay, row.date, timezone),
      })
    )
  )

type PlanWrite = Extract<
  CareWrite,
  {
    readonly _tag:
      | 'CompletePlanStep'
      | 'ReopenPlanStep'
      | 'DeletePlanStep'
      | 'SetPlanStatus'
      | 'DeletePlan'
      | 'LinkPlanToDiagnosis'
  }
>

type PlantLifeWrite = Extract<
  CareWrite,
  { readonly _tag: 'BuryPlant' | 'RevivePlant' | 'DeletePlant' }
>

export class PlantRowNotWrittenDefect extends Data.TaggedError(
  'PlantRowNotWrittenDefect'
)<{
  readonly write: PlantLifeWrite
  readonly written: number
}> {}

const plantWrittenOnce =
  (write: PlantLifeWrite) =>
  (rows: ReadonlyArray<unknown>): Effect.Effect<void> =>
    rows.length === 1
      ? Effect.void
      : Effect.die(
          new PlantRowNotWrittenDefect({ write, written: rows.length })
        )

export type PlantRowLock = 'no key update' | 'update'

export class PlanRowNotWrittenDefect extends Data.TaggedError(
  'PlanRowNotWrittenDefect'
)<{
  readonly write: PlanWrite
  readonly written: number
}> {}

export const writtenOnce =
  (write: PlanWrite) =>
  (rows: ReadonlyArray<unknown>): Effect.Effect<void> =>
    rows.length === 1
      ? Effect.void
      : Effect.die(new PlanRowNotWrittenDefect({ write, written: rows.length }))

type SetPlanStatus = Extract<CareWrite, { readonly _tag: 'SetPlanStatus' }>

const STAMPS_OF = {
  accepted: ({ from, at }) =>
    from === 'completed' ? { completedAt: null } : { acceptedAt: at },
  completed: ({ at }) => ({ completedAt: at }),
  dismissed: () => ({}),
} satisfies Record<
  SetPlanStatus['to'],
  (moved: { readonly from: SetPlanStatus['from']; readonly at: Date }) => {
    readonly acceptedAt?: Date
    readonly completedAt?: Date | null
  }
>

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

export const CareStoreLive = Layer.effect(
  CareStore,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const lastCareAtOf = (plantId: string, careType: string) =>
      sql<Date | null>`(
        select max(${careLogs.date}) from ${careLogs}
        where ${careLogs.plantId} = ${plantId}
          and ${careLogs.type}::text = ${careType}
      )`

    const refreshLastCare = (
      edited: ReadonlyArray<{ readonly plantId: string; readonly type: string }>
    ) =>
      Effect.forEach(
        edited,
        ({ plantId, type }) =>
          db
            .update(plantCareSchedules)
            .set({ lastCareAt: lastCareAtOf(plantId, type) })
            .where(
              and(
                eq(plantCareSchedules.plantId, plantId),
                sql`${plantCareSchedules.careType}::text = ${type}`
              )
            ),
        { discard: true }
      )
    const line = { plantId: careLogs.plantId, type: careLogs.type }

    const write: (write: CareWrite) => Effect.Effect<void, SqlError> =
      CareWrite.$match({
        InsertCare: (w) =>
          Effect.asVoid(
            db.insert(careLogs).values({
              id: w.id,
              plantId: w.plantId,
              type: w.careType,
              date: DateTime.toDateUtc(w.at),
              careDay: w.day,
              notes: Option.getOrNull(w.notes),
              photoUrl: Option.getOrNull(w.photoUrl),
              performedByUserId: Option.getOrNull(w.by),
            })
          ),
        ReplaceCare: (w) =>
          Effect.flatMap(
            db
              .update(careLogs)
              .set({
                ...Option.match(w.when, {
                  onNone: () => ({}),
                  onSome: ({ day, at }) => ({
                    date: DateTime.toDateUtc(at),
                    careDay: day,
                  }),
                }),
                ...Option.match(w.notes, {
                  onNone: () => ({}),
                  onSome: (notes) => ({ notes: Option.getOrNull(notes) }),
                }),
                ...Option.match(w.photoUrl, {
                  onNone: () => ({}),
                  onSome: (photoUrl) => ({
                    photoUrl: Option.getOrNull(photoUrl),
                  }),
                }),
                updatedAt: sql`now()`,
              })
              .where(eq(careLogs.id, w.id))
              .returning(line),
            refreshLastCare
          ),
        DeleteCare: (w) =>
          Effect.flatMap(
            db.delete(careLogs).where(eq(careLogs.id, w.id)).returning(line),
            refreshLastCare
          ),
        PutSchedule: (w) => {
          const nextCareAt = DateTime.toDateUtc(
            CareDays.startOf(w.schedule.dueDay, w.timezone)
          )
          const lastCareAt = lastCareAtOf(w.plantId, w.careType)
          return Effect.asVoid(
            db
              .insert(plantCareSchedules)
              .values({
                plantId: w.plantId,
                careType: w.careType,
                frequencyDays: w.schedule.frequency,
                nextCareAt,
                dueDay: w.schedule.dueDay,
                lastCareAt,
              })
              .onConflictDoUpdate({
                target: [
                  plantCareSchedules.plantId,
                  plantCareSchedules.careType,
                ],
                set: {
                  frequencyDays: w.schedule.frequency,
                  nextCareAt,
                  dueDay: w.schedule.dueDay,
                  lastCareAt,
                },
              })
          )
        },
        DropSchedule: (w) =>
          Effect.asVoid(
            db
              .delete(plantCareSchedules)
              .where(
                and(
                  eq(plantCareSchedules.plantId, w.plantId),
                  eq(plantCareSchedules.careType, w.careType)
                )
              )
          ),
        CompletePlanStep: (w) =>
          Effect.flatMap(
            db
              .update(carePlanSteps)
              .set({
                completedAt: DateTime.toDateUtc(w.at),
                careLogId: Option.getOrNull(w.careLogId),
              })
              .where(
                and(
                  eq(carePlanSteps.id, w.stepId),
                  isNull(carePlanSteps.completedAt)
                )
              )
              .returning({ id: carePlanSteps.id }),
            writtenOnce(w)
          ),
        ReopenPlanStep: (w) =>
          Effect.flatMap(
            db
              .update(carePlanSteps)
              .set({ completedAt: null, careLogId: null })
              .where(
                and(
                  eq(carePlanSteps.id, w.stepId),
                  isNotNull(carePlanSteps.completedAt)
                )
              )
              .returning({ id: carePlanSteps.id }),
            writtenOnce(w)
          ),
        DeletePlanStep: (w) =>
          Effect.flatMap(
            db
              .delete(carePlanSteps)
              .where(eq(carePlanSteps.id, w.stepId))
              .returning({ id: carePlanSteps.id }),
            writtenOnce(w)
          ),
        SetPlanStatus: (w) =>
          Effect.flatMap(
            db
              .update(carePlans)
              .set({
                status: w.to,
                ...STAMPS_OF[w.to]({
                  from: w.from,
                  at: DateTime.toDateUtc(w.at),
                }),
              })
              .where(
                and(eq(carePlans.id, w.planId), eq(carePlans.status, w.from))
              )
              .returning({ id: carePlans.id }),
            writtenOnce(w)
          ),
        DeletePlan: (w) =>
          Effect.flatMap(
            db
              .delete(carePlans)
              .where(eq(carePlans.id, w.planId))
              .returning({ id: carePlans.id }),
            writtenOnce(w)
          ),
        InsertPlan: (w) =>
          Effect.gen(function* () {
            yield* db.insert(carePlans).values({
              id: w.planId,
              plantId: w.plantId,
              userId: w.authorId,
              title: w.title,
              source: w.source,
            })
            if (Array.isReadonlyArrayEmpty(w.steps)) return
            yield* db.insert(carePlanSteps).values(
              Array.map(w.steps, (step, position) => ({
                planId: w.planId,
                position,
                title: step.title,
                description: Option.getOrNull(step.description),
                careType: Option.getOrNull(step.careType),
                dueDate: Option.getOrNull(
                  Option.map(step.dueAt, DateTime.toDateUtc)
                ),
              }))
            )
          }),
        LinkPlanToDiagnosis: (w) =>
          Effect.flatMap(
            db
              .update(carePlans)
              .set({ diagnosisId: w.diagnosisId })
              .where(eq(carePlans.id, w.planId))
              .returning({ id: carePlans.id }),
            writtenOnce(w)
          ),
        InsertPlant: (w) =>
          Effect.asVoid(
            db.insert(plants).values({
              id: w.plantId,
              ...ownerColumns(w.owner),
              createdByUserId: w.createdBy,
              health: 'HEALTHY',
              name: w.draft.name,
              description: Option.getOrNull(w.draft.description),
              category: Option.getOrNull(w.draft.category),
              imageUrl: Option.getOrNull(w.draft.imageUrl),
              humidityRating: w.draft.humidityRating,
              lightingRating: w.draft.lightingRating,
              petToxicityRating: w.draft.petToxicityRating,
              wateringRating: w.draft.wateringRating,
              potWidthCm: Option.getOrNull(w.draft.potWidthCm),
              potHeightCm: Option.getOrNull(w.draft.potHeightCm),
              roomId: Option.getOrNull(w.draft.roomId),
            })
          ),
        BuryPlant: (w) =>
          Effect.flatMap(
            db
              .update(plants)
              .set({
                diedAt: DateTime.toDateUtc(w.at),
                deathCause: w.cause,
                deathNote: Option.getOrNull(w.note),
              })
              .where(and(eq(plants.id, w.plantId), isNull(plants.diedAt)))
              .returning({ id: plants.id }),
            plantWrittenOnce(w)
          ),
        RevivePlant: (w) =>
          Effect.flatMap(
            db
              .update(plants)
              .set({ diedAt: null, deathCause: null, deathNote: null })
              .where(and(eq(plants.id, w.plantId), isNotNull(plants.diedAt)))
              .returning({ id: plants.id }),
            plantWrittenOnce(w)
          ),
        DeletePlant: (w) =>
          Effect.flatMap(
            db
              .delete(plants)
              .where(eq(plants.id, w.plantId))
              .returning({ id: plants.id }),
            plantWrittenOnce(w)
          ),
      })

    const lockAndLoad = Effect.fn('CareStore.lockAndLoad')(function* (
      plantIds: ReadonlyArray<string>,
      careTypes: ReadonlyArray<CareType>,
      lock: PlantRowLock = 'no key update'
    ) {
      if (Array.isReadonlyArrayEmpty(plantIds)) {
        return new Map<string, CarePlant>()
      }
      const ids = [...plantIds]
      const locked = yield* db
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
        .orderBy(asc(plants.id))
        .for(lock, { of: plants })
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
          const seen = seePlantCare(row, schedules, row.timezone, now)
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
              ),
              row.timezone
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
            db
              .select({ id: users.id })
              .from(users)
              .where(inArray(users.id, [...userIds]))
              .orderBy(asc(users.id))
              .for('key share'),
            (rows) => new Set(Array.map(rows, (row) => row.id))
          )

    return CareStore.of({
      careLogKey: Effect.fn('CareStore.careLogKey')(function* (
        careLogId: string
      ) {
        const rows = yield* db
          .select({ plantId: careLogs.plantId, careType: careLogs.type })
          .from(careLogs)
          .where(eq(careLogs.id, careLogId))
        return Array.head(rows)
      }),

      careTypesOfPlan: Effect.fn('CareStore.careTypesOfPlan')(function* (
        planId: string
      ) {
        const rows = yield* db
          .selectDistinct({ careType: carePlanSteps.careType })
          .from(carePlanSteps)
          .where(eq(carePlanSteps.planId, planId))
        return Array.flatMap(rows, (row) =>
          Option.toArray(Option.fromNullishOr(row.careType))
        )
      }),

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

      apply: (writes) =>
        Effect.forEach(writes, write, { discard: true }).pipe(
          Effect.withSpan('CareStore.apply')
        ),

      linkPlanToMessage: Effect.fn('CareStore.linkPlanToMessage')(function* (
        planId: string,
        chatMessageId: string
      ) {
        yield* db
          .update(carePlans)
          .set({ chatMessageId })
          .where(eq(carePlans.id, planId))
      }),

      weatherProfiles: Effect.fn('CareStore.weatherProfiles')(function* (
        plantIds: ReadonlyArray<string>
      ) {
        if (Array.isReadonlyArrayEmpty(plantIds)) return []
        const rows = yield* db
          .select({
            id: plants.id,
            category: plants.category,
            lightingRating: plants.lightingRating,
            humidityRating: plants.humidityRating,
            wateringRating: plants.wateringRating,
            isOutdoor: rooms.isOutdoor,
            roomLuminosity: rooms.luminosity,
            roomOrientation: rooms.orientation,
            frequencyDays: plantCareSchedules.frequencyDays,
            latitude: sql<
              number | null
            >`case when ${plants.canopyId} is not null then ${canopies.latitude}
                   when ${users.weatherEnabled} then ${users.latitude} end`,
            longitude: sql<
              number | null
            >`case when ${plants.canopyId} is not null then ${canopies.longitude}
                   when ${users.weatherEnabled} then ${users.longitude} end`,
          })
          .from(plants)
          .leftJoin(rooms, eq(rooms.id, plants.roomId))
          .leftJoin(users, eq(users.id, plants.userId))
          .leftJoin(canopies, eq(canopies.id, plants.canopyId))
          .leftJoin(
            plantCareSchedules,
            and(
              eq(plantCareSchedules.plantId, plants.id),
              eq(plantCareSchedules.careType, 'watering')
            )
          )
          .where(inArray(plants.id, [...plantIds]))
        return Array.flatMap(
          rows,
          (row): ReadonlyArray<WeatherProfile> =>
            row.latitude && row.longitude
              ? [
                  {
                    latitude: row.latitude,
                    longitude: row.longitude,
                    plant: {
                      id: row.id,
                      category: row.category,
                      lightingRating: row.lightingRating,
                      humidityRating: row.humidityRating,
                      wateringRating: row.wateringRating,
                      wateringFrequencyDays:
                        row.frequencyDays ?? DEFAULT_WATERING_FREQUENCY_DAYS,
                      isOutdoor: row.isOutdoor ?? false,
                      roomLuminosity: row.roomLuminosity,
                      roomOrientation: row.roomOrientation,
                    },
                  },
                ]
              : []
        )
      }),
    })
  })
)
