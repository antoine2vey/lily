import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { isLivingPlant } from '@lily/api/repositories/helpers/living-plant'
import { carePlanSteps, carePlans, plants } from '@lily/db/schema'
import { type CareType, nowAsDate } from '@lily/shared'
import type {
  CarePlan,
  CarePlanSource,
  CarePlanStatus,
  CarePlanStep,
} from '@lily/shared/care-plan'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, Order, pipe } from 'effect'

export type CarePlanRow = typeof carePlans.$inferSelect
export type CarePlanStepRow = typeof carePlanSteps.$inferSelect

export interface CreateCarePlanStepData {
  readonly title: string
  readonly description?: string | undefined
  readonly careType?: CareType | undefined
  readonly dueDate?: Date | undefined
}

export interface CreateCarePlanData {
  readonly plantId: string
  readonly userId: string
  readonly title: string
  readonly source?: CarePlanSource | undefined
  readonly chatMessageId?: string | undefined
  readonly diagnosisId?: string | undefined
  readonly steps: ReadonlyArray<CreateCarePlanStepData>
}

export interface CompleteStepData {
  readonly completedAt: Date
  readonly careLogId?: string | undefined
}

export interface UpdateCarePlanStatusData {
  readonly status: CarePlanStatus
  readonly acceptedAt?: Date | undefined
  // `null` clears the timestamp (reopening a completed plan).
  readonly completedAt?: Date | null | undefined
}

interface PlanPlantInfo {
  readonly name: string
  readonly imageUrl: string | null
}

const stepPositionOrder: Order.Order<CarePlanStep> = Order.mapInput(
  Order.number,
  (step: CarePlanStep) => step.position
)

export const mapToCarePlanStep = (row: CarePlanStepRow): CarePlanStep => ({
  id: row.id,
  planId: row.planId,
  position: row.position,
  title: row.title,
  description: Option.getOrUndefined(Option.fromNullable(row.description)),
  careType: Option.getOrUndefined(Option.fromNullable(row.careType)),
  dueDate: Option.getOrUndefined(Option.fromNullable(row.dueDate)),
  completedAt: Option.getOrUndefined(Option.fromNullable(row.completedAt)),
  careLogId: Option.getOrUndefined(Option.fromNullable(row.careLogId)),
})

export const mapToCarePlan = (
  row: CarePlanRow,
  plant: PlanPlantInfo,
  steps: ReadonlyArray<CarePlanStepRow>
): CarePlan => ({
  id: row.id,
  plantId: row.plantId,
  plantName: plant.name,
  plantImageUrl: plant.imageUrl,
  userId: row.userId,
  chatMessageId: Option.getOrUndefined(Option.fromNullable(row.chatMessageId)),
  diagnosisId: Option.getOrUndefined(Option.fromNullable(row.diagnosisId)),
  title: row.title,
  source: row.source,
  status: row.status,
  steps: pipe(
    steps,
    Array.map(mapToCarePlanStep),
    Array.sort(stepPositionOrder)
  ),
  acceptedAt: Option.getOrUndefined(Option.fromNullable(row.acceptedAt)),
  completedAt: Option.getOrUndefined(Option.fromNullable(row.completedAt)),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const isStepOpen = (step: {
  readonly completedAt: Date | null | undefined
}): boolean => Option.isNone(Option.fromNullable(step.completedAt))

export interface ICarePlanRepository {
  readonly create: (
    data: CreateCarePlanData
  ) => Effect.Effect<CarePlan, SqlError>
  /** Owner-scoped lookup: returns null when the plan belongs to someone else. */
  readonly findById: (
    id: string,
    userId: string
  ) => Effect.Effect<CarePlan | null, SqlError>
  readonly findByUser: (
    userId: string,
    status?: CarePlanStatus
  ) => Effect.Effect<ReadonlyArray<CarePlan>, SqlError>
  readonly findByPlant: (
    plantId: string,
    userId: string
  ) => Effect.Effect<ReadonlyArray<CarePlan>, SqlError>
  readonly updateStatus: (
    id: string,
    userId: string,
    data: UpdateCarePlanStatusData
  ) => Effect.Effect<CarePlan | null, SqlError>
  readonly linkChatMessage: (
    planId: string,
    chatMessageId: string
  ) => Effect.Effect<void, SqlError>
  readonly delete: (id: string, userId: string) => Effect.Effect<void, SqlError>
  readonly completeStep: (
    stepId: string,
    data: CompleteStepData
  ) => Effect.Effect<CarePlanStep | null, SqlError>
  readonly uncompleteStep: (
    stepId: string
  ) => Effect.Effect<CarePlanStep | null, SqlError>
  readonly deleteStep: (stepId: string) => Effect.Effect<void, SqlError>
  /**
   * Cross-completion: when the plant is cared for through the regular task,
   * the earliest open step of that care type on an *accepted* plan is marked
   * done with the resulting care log.
   */
  readonly completeEarliestOpenStep: (
    plantId: string,
    careType: CareType,
    data: CompleteStepData
  ) => Effect.Effect<CarePlanStep | null, SqlError>
  /** Flips an accepted plan to `completed` once every step is done. */
  readonly settleCompletion: (
    planId: string
  ) => Effect.Effect<CarePlan | null, SqlError>
}

export class CarePlanRepository extends Context.Tag('CarePlanRepository')<
  CarePlanRepository,
  ICarePlanRepository
>() {}

export const CarePlanRepositoryLive = Layer.effect(
  CarePlanRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const plantSelect = { name: plants.name, imageUrl: plants.imageUrl }

    const stepsForPlans = (planIds: ReadonlyArray<string>) =>
      Array.isEmptyReadonlyArray(planIds)
        ? Effect.succeed([] as CarePlanStepRow[])
        : db
            .select()
            .from(carePlanSteps)
            .where(inArray(carePlanSteps.planId, [...planIds]))
            .orderBy(asc(carePlanSteps.position))

    const hydrate = (
      rows: ReadonlyArray<{ plan: CarePlanRow; plant: PlanPlantInfo }>
    ) =>
      Effect.gen(function* () {
        const steps = yield* stepsForPlans(Array.map(rows, (r) => r.plan.id))
        const byPlan = Array.groupBy(steps, (s) => s.planId)
        return Array.map(rows, (r) =>
          mapToCarePlan(
            r.plan,
            r.plant,
            pipe(
              Option.fromNullable(byPlan[r.plan.id]),
              Option.getOrElse(() => [] as CarePlanStepRow[])
            )
          )
        )
      })

    const findOne = (planId: string, userId: string) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({ plan: carePlans, plant: plantSelect })
          .from(carePlans)
          .innerJoin(plants, eq(carePlans.plantId, plants.id))
          .where(and(eq(carePlans.id, planId), eq(carePlans.userId, userId)))
        const hydrated = yield* hydrate(rows)
        return pipe(Array.head(hydrated), Option.getOrNull)
      })

    return {
      create: Effect.fn('CarePlanRepository.create')(function* (
        data: CreateCarePlanData
      ) {
        const planRows = yield* db
          .insert(carePlans)
          .values({
            plantId: data.plantId,
            userId: data.userId,
            title: data.title,
            source: pipe(
              Option.fromNullable(data.source),
              Option.getOrElse(() => 'ai' as const)
            ),
            chatMessageId: Option.getOrNull(
              Option.fromNullable(data.chatMessageId)
            ),
            diagnosisId: Option.getOrNull(
              Option.fromNullable(data.diagnosisId)
            ),
          })
          .returning()
        const plan = pipe(Array.head(planRows), Option.getOrThrow)

        if (Array.isNonEmptyReadonlyArray(data.steps)) {
          yield* db.insert(carePlanSteps).values(
            Array.map(data.steps, (step, index) => ({
              planId: plan.id,
              position: index,
              title: step.title,
              description: Option.getOrNull(
                Option.fromNullable(step.description)
              ),
              careType: Option.getOrNull(Option.fromNullable(step.careType)),
              dueDate: Option.getOrNull(Option.fromNullable(step.dueDate)),
            }))
          )
        }

        const created = yield* findOne(plan.id, data.userId)
        return pipe(Option.fromNullable(created), Option.getOrThrow)
      }),

      findById: Effect.fn('CarePlanRepository.findById')(function* (
        id: string,
        userId: string
      ) {
        return yield* findOne(id, userId)
      }),

      findByUser: Effect.fn('CarePlanRepository.findByUser')(function* (
        userId: string,
        status?: CarePlanStatus
      ) {
        const rows = yield* db
          .select({ plan: carePlans, plant: plantSelect })
          .from(carePlans)
          .innerJoin(plants, eq(carePlans.plantId, plants.id))
          // The Care tab checklist: a plant in the cemetery must not surface
          // its plans there. By-id and by-plant lookups stay unfiltered.
          .where(
            and(
              eq(carePlans.userId, userId),
              isLivingPlant(),
              ...pipe(
                Option.fromNullable(status),
                Option.map((s) => [eq(carePlans.status, s)]),
                Option.getOrElse(() => [])
              )
            )
          )
          .orderBy(desc(carePlans.createdAt))
        return yield* hydrate(rows)
      }),

      findByPlant: Effect.fn('CarePlanRepository.findByPlant')(function* (
        plantId: string,
        userId: string
      ) {
        const rows = yield* db
          .select({ plan: carePlans, plant: plantSelect })
          .from(carePlans)
          .innerJoin(plants, eq(carePlans.plantId, plants.id))
          .where(
            and(eq(carePlans.plantId, plantId), eq(carePlans.userId, userId))
          )
          .orderBy(desc(carePlans.createdAt))
        return yield* hydrate(rows)
      }),

      updateStatus: Effect.fn('CarePlanRepository.updateStatus')(function* (
        id: string,
        userId: string,
        data: UpdateCarePlanStatusData
      ) {
        yield* db
          .update(carePlans)
          .set({
            status: data.status,
            ...(data.acceptedAt !== undefined
              ? { acceptedAt: data.acceptedAt }
              : {}),
            ...(data.completedAt !== undefined
              ? { completedAt: data.completedAt }
              : {}),
          })
          .where(and(eq(carePlans.id, id), eq(carePlans.userId, userId)))
        return yield* findOne(id, userId)
      }),

      linkChatMessage: Effect.fn('CarePlanRepository.linkChatMessage')(
        function* (planId: string, chatMessageId: string) {
          yield* db
            .update(carePlans)
            .set({ chatMessageId })
            .where(eq(carePlans.id, planId))
        }
      ),

      delete: Effect.fn('CarePlanRepository.delete')(function* (
        id: string,
        userId: string
      ) {
        yield* db
          .delete(carePlans)
          .where(and(eq(carePlans.id, id), eq(carePlans.userId, userId)))
      }),

      completeStep: Effect.fn('CarePlanRepository.completeStep')(function* (
        stepId: string,
        data: CompleteStepData
      ) {
        const rows = yield* db
          .update(carePlanSteps)
          .set({
            completedAt: data.completedAt,
            careLogId: Option.getOrNull(Option.fromNullable(data.careLogId)),
          })
          .where(eq(carePlanSteps.id, stepId))
          .returning()
        return pipe(
          Array.head(rows),
          Option.map(mapToCarePlanStep),
          Option.getOrNull
        )
      }),

      uncompleteStep: Effect.fn('CarePlanRepository.uncompleteStep')(function* (
        stepId: string
      ) {
        const rows = yield* db
          .update(carePlanSteps)
          .set({ completedAt: null, careLogId: null })
          .where(eq(carePlanSteps.id, stepId))
          .returning()
        return pipe(
          Array.head(rows),
          Option.map(mapToCarePlanStep),
          Option.getOrNull
        )
      }),

      deleteStep: Effect.fn('CarePlanRepository.deleteStep')(function* (
        stepId: string
      ) {
        yield* db.delete(carePlanSteps).where(eq(carePlanSteps.id, stepId))
      }),

      completeEarliestOpenStep: Effect.fn(
        'CarePlanRepository.completeEarliestOpenStep'
      )(function* (
        plantId: string,
        careType: CareType,
        data: CompleteStepData
      ) {
        const candidates = yield* db
          .select({ step: carePlanSteps })
          .from(carePlanSteps)
          .innerJoin(carePlans, eq(carePlanSteps.planId, carePlans.id))
          .where(
            and(
              eq(carePlans.plantId, plantId),
              eq(carePlans.status, 'accepted'),
              eq(carePlanSteps.careType, careType),
              isNull(carePlanSteps.completedAt)
            )
          )
          .orderBy(asc(carePlans.createdAt), asc(carePlanSteps.position))
          .limit(1)

        const target = pipe(
          Array.head(candidates),
          Option.map((c) => c.step),
          Option.getOrNull
        )
        if (!target) return null

        const rows = yield* db
          .update(carePlanSteps)
          .set({
            completedAt: data.completedAt,
            careLogId: Option.getOrNull(Option.fromNullable(data.careLogId)),
          })
          .where(eq(carePlanSteps.id, target.id))
          .returning()
        return pipe(
          Array.head(rows),
          Option.map(mapToCarePlanStep),
          Option.getOrNull
        )
      }),

      settleCompletion: Effect.fn('CarePlanRepository.settleCompletion')(
        function* (planId: string) {
          const planRows = yield* db
            .select({ plan: carePlans, plant: plantSelect })
            .from(carePlans)
            .innerJoin(plants, eq(carePlans.plantId, plants.id))
            .where(eq(carePlans.id, planId))
          const current = pipe(Array.head(planRows), Option.getOrNull)
          if (!current) return null

          const steps = yield* stepsForPlans([planId])
          const allDone =
            Array.isNonEmptyReadonlyArray(steps) &&
            !Array.some(steps, isStepOpen)

          if (current.plan.status === 'accepted' && allDone) {
            yield* db
              .update(carePlans)
              .set({ status: 'completed', completedAt: nowAsDate() })
              .where(eq(carePlans.id, planId))
          }

          return yield* findOne(planId, current.plan.userId)
        }
      ),
    }
  })
)
