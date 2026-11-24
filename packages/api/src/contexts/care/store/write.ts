import { CareWrite } from '@lily/api/contexts/care/domain/decide'
import { Transition, transitionDecided } from '@lily/api/kernel/transition'
import { expectWritten } from '@lily/api/kernel/written'
import { ownerColumns } from '@lily/api/repositories/helpers/plant-owner'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  careLogs,
  carePlanSteps,
  carePlans,
  plantCareSchedules,
  plants,
} from '@lily/db/schema'
import { CareDays } from '@lily/shared'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { Array, DateTime, Effect, Option, type Record } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

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

export const makeWrites = Effect.gen(function* () {
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
              target: [plantCareSchedules.plantId, plantCareSchedules.careType],
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
          expectWritten(carePlanSteps, w)
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
          expectWritten(carePlanSteps, w)
        ),
      DeletePlanStep: (w) =>
        Effect.flatMap(
          db
            .delete(carePlanSteps)
            .where(eq(carePlanSteps.id, w.stepId))
            .returning({ id: carePlanSteps.id }),
          expectWritten(carePlanSteps, w)
        ),
      SetPlanStatus: (w) =>
        Effect.flatMap(
          transitionDecided(db, 'Plan', w.planId, {
            from: w.from,
            to: w.to,
            also: STAMPS_OF[w.to]({
              from: w.from,
              at: DateTime.toDateUtc(w.at),
            }),
          }),
          Transition.$match({
            Moved: () => Effect.void,
            LostRace: () => expectWritten(carePlans, w)([]),
          })
        ),
      DeletePlan: (w) =>
        Effect.flatMap(
          db
            .delete(carePlans)
            .where(eq(carePlans.id, w.planId))
            .returning({ id: carePlans.id }),
          expectWritten(carePlans, w)
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
          expectWritten(carePlans, w)
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
            humidityRating: w.draft.humidityRating,
            lightingRating: w.draft.lightingRating,
            petToxicityRating: w.draft.petToxicityRating,
            wateringRating: w.draft.wateringRating,
            potWidthCm: Option.getOrNull(w.draft.potWidthCm),
            potHeightCm: Option.getOrNull(w.draft.potHeightCm),
            roomId: Option.getOrNull(w.draft.roomId),
            remindersEnabled: w.draft.remindersEnabled,
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
          expectWritten(plants, w)
        ),
      RevivePlant: (w) =>
        Effect.flatMap(
          db
            .update(plants)
            .set({ diedAt: null, deathCause: null, deathNote: null })
            .where(and(eq(plants.id, w.plantId), isNotNull(plants.diedAt)))
            .returning({ id: plants.id }),
          expectWritten(plants, w)
        ),
      DeletePlant: (w) =>
        Effect.flatMap(
          db
            .delete(plants)
            .where(eq(plants.id, w.plantId))
            .returning({ id: plants.id }),
          expectWritten(plants, w)
        ),
    })

  return {
    write,
    linkPlanToMessage: Effect.fn('CareStore.linkPlanToMessage')(function* (
      planId: string,
      chatMessageId: string
    ) {
      yield* db
        .update(carePlans)
        .set({ chatMessageId })
        .where(eq(carePlans.id, planId))
    }),
  }
})
