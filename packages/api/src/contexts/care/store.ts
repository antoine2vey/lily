import {
  type CareEntry,
  type CareLine,
  type CarePlant,
  frequencyOfDays,
  type OpenPlanStep,
  PlantLife,
  type Schedule,
} from '@lily/api/contexts/care/domain/care-plant'
import { CareWrite } from '@lily/api/contexts/care/domain/decide'
import { seePlantCare } from '@lily/api/contexts/care/plant-care'
import { careTimezoneSql } from '@lily/api/repositories/helpers/care-timezone'
import { ownerOf } from '@lily/api/repositories/helpers/plant-owner'
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
import { CARE_TYPES, CareDays, type CareType } from '@lily/shared'
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  Array,
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Order,
  pipe,
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

const DEFAULT_WATERING_FREQUENCY_DAYS = 7

export class CareStore extends Context.Service<
  CareStore,
  {
    readonly careLogKey: (
      careLogId: string
    ) => Effect.Effect<Option.Option<CareLogKey>, SqlError>
    readonly lockAndLoad: (
      plantIds: ReadonlyArray<string>,
      careTypes: ReadonlyArray<CareType>
    ) => Effect.Effect<ReadonlyMap<string, CarePlant>, SqlError>
    readonly apply: (
      writes: ReadonlyArray<CareWrite>
    ) => Effect.Effect<void, SqlError>
    readonly weatherProfiles: (
      plantIds: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyArray<WeatherProfile>, SqlError>
  }
>()('care/CareStore') {}

type ScheduleRow = typeof plantCareSchedules.$inferSelect

const toSchedule = (row: ScheduleRow, timezone: string): Schedule => {
  const startedOn = CareDays.of(DateTime.makeUnsafe(row.createdAt), timezone)
  return {
    frequency: frequencyOfDays(row.frequencyDays),
    dueDay: CareDays.of(DateTime.makeUnsafe(row.nextCareAt), timezone),
    startedOn,
  }
}

const latestFirst = Order.mapInput(
  Order.flip(Order.Date),
  (row: { readonly date: Date }) => row.date
)

const toHistory = (
  rows: ReadonlyArray<{ readonly id: string; readonly date: Date }>,
  timezone: string
): ReadonlyArray<CareEntry> =>
  pipe(
    rows,
    Array.sort(latestFirst),
    Array.map(
      (row): CareEntry => ({
        id: row.id,
        day: CareDays.of(DateTime.makeUnsafe(row.date), timezone),
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
          Effect.asVoid(
            db
              .update(carePlanSteps)
              .set({
                completedAt: DateTime.toDateUtc(w.at),
                careLogId: w.careLogId,
              })
              .where(eq(carePlanSteps.id, w.stepId))
          ),
        SettlePlan: (w) =>
          Effect.asVoid(
            db
              .update(carePlans)
              .set({
                status: 'completed',
                completedAt: DateTime.toDateUtc(w.at),
              })
              .where(
                and(
                  eq(carePlans.id, w.planId),
                  eq(carePlans.status, 'accepted')
                )
              )
          ),
      })

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

      lockAndLoad: Effect.fn('CareStore.lockAndLoad')(function* (
        plantIds: ReadonlyArray<string>,
        careTypes: ReadonlyArray<CareType>
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
          .for('no key update', { of: plants })
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
              })
              .from(careLogs)
              .where(
                and(
                  inArray(careLogs.plantId, ids),
                  inArray(careLogs.type, [...careTypes])
                )
              )
        const stepRows = yield* db
          .select({
            id: carePlanSteps.id,
            planId: carePlanSteps.planId,
            careType: carePlanSteps.careType,
            plantId: carePlans.plantId,
            planStatus: carePlans.status,
          })
          .from(carePlanSteps)
          .innerJoin(carePlans, eq(carePlanSteps.planId, carePlans.id))
          .where(
            and(
              inArray(carePlans.plantId, ids),
              isNull(carePlanSteps.completedAt)
            )
          )
          .orderBy(
            desc(sql`${carePlans.status} = 'accepted'`),
            asc(carePlans.createdAt),
            asc(carePlanSteps.position)
          )

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
                life:
                  row.diedAt === null ? PlantLife.Living() : PlantLife.Dead(),
                timezone: row.timezone,
                today: seen.today,
                needsAttention: seen.health === 'NEEDS_ATTENTION',
                lines: new Map(
                  Array.map(
                    Array.filter(CARE_TYPES, (t) =>
                      Array.contains(careTypes, t)
                    ),
                    (careType) => [careType, lineOf(careType)]
                  )
                ),
                openPlanSteps: Array.map(
                  Array.filter(stepRows, (s) => s.plantId === row.id),
                  (s): OpenPlanStep => ({
                    id: s.id,
                    planId: s.planId,
                    planAccepted: s.planStatus === 'accepted',
                    careType: Option.fromNullishOr(s.careType),
                  })
                ),
              },
            ]
          })
        )
      }),

      apply: (writes) =>
        Effect.forEach(writes, write, { discard: true }).pipe(
          Effect.withSpan('CareStore.apply')
        ),

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
