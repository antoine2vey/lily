import { isLivingPlant } from '@lily/api/repositories/helpers/living-plant'
import { tending } from '@lily/api/repositories/helpers/tending'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopyMembers,
  careDelegations,
  carePlanSteps,
  carePlans,
  delegationPlants,
  plants,
} from '@lily/db/schema'
import type {
  CarePlan,
  CarePlanStatus,
  CarePlanStep,
} from '@lily/shared/care-plan'
import { and, asc, desc, eq, exists, inArray, or } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, Order, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export type CarePlanRow = typeof carePlans.$inferSelect
export type CarePlanStepRow = typeof carePlanSteps.$inferSelect

interface PlanPlantInfo {
  readonly name: string
  readonly imageUrl: string | null
}

const stepPositionOrder: Order.Order<CarePlanStep> = Order.mapInput(
  Order.Number,
  (step: CarePlanStep) => step.position
)

export const mapToCarePlanStep = (row: CarePlanStepRow): CarePlanStep => ({
  id: row.id,
  planId: row.planId,
  position: row.position,
  title: row.title,
  description: Option.getOrUndefined(Option.fromNullishOr(row.description)),
  careType: Option.getOrUndefined(Option.fromNullishOr(row.careType)),
  dueDate: Option.getOrUndefined(Option.fromNullishOr(row.dueDate)),
  completedAt: Option.getOrUndefined(Option.fromNullishOr(row.completedAt)),
  careLogId: Option.getOrUndefined(Option.fromNullishOr(row.careLogId)),
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
  chatMessageId: Option.getOrUndefined(Option.fromNullishOr(row.chatMessageId)),
  diagnosisId: Option.getOrUndefined(Option.fromNullishOr(row.diagnosisId)),
  title: row.title,
  source: row.source,
  status: row.status,
  steps: pipe(
    steps,
    Array.map(mapToCarePlanStep),
    Array.sort(stepPositionOrder)
  ),
  acceptedAt: Option.getOrUndefined(Option.fromNullishOr(row.acceptedAt)),
  completedAt: Option.getOrUndefined(Option.fromNullishOr(row.completedAt)),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export interface ICarePlanRepository {
  readonly findById: (id: string) => Effect.Effect<CarePlan | null, SqlError>
  readonly findByUser: (
    userId: string,
    status?: CarePlanStatus
  ) => Effect.Effect<ReadonlyArray<CarePlan>, SqlError>
  readonly findByPlant: (
    plantId: string
  ) => Effect.Effect<ReadonlyArray<CarePlan>, SqlError>
}

export class CarePlanRepository extends Context.Service<
  CarePlanRepository,
  ICarePlanRepository
>()('CarePlanRepository') {}

export const CarePlanRepositoryLive = Layer.effect(
  CarePlanRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const plantSelect = { name: plants.name, imageUrl: plants.imageUrl }

    const authorReachesPlant = or(
      eq(plants.userId, carePlans.userId),
      inArray(
        plants.canopyId,
        db
          .select({ canopyId: canopyMembers.canopyId })
          .from(canopyMembers)
          .where(eq(canopyMembers.userId, carePlans.userId))
      ),
      exists(
        db
          .select({ id: delegationPlants.plantId })
          .from(delegationPlants)
          .innerJoin(
            careDelegations,
            eq(careDelegations.id, delegationPlants.delegationId)
          )
          .where(
            and(
              eq(delegationPlants.plantId, plants.id),
              eq(careDelegations.caretakerId, carePlans.userId),
              eq(careDelegations.ownerId, plants.userId),
              tending()
            )
          )
      )
    )

    const stepsForPlans = (planIds: ReadonlyArray<string>) =>
      Array.isReadonlyArrayEmpty(planIds)
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
              Option.fromNullishOr(byPlan[r.plan.id]),
              Option.getOrElse(() => [] as CarePlanStepRow[])
            )
          )
        )
      })

    const findPlan = (where: ReturnType<typeof and>) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({ plan: carePlans, plant: plantSelect })
          .from(carePlans)
          .innerJoin(plants, eq(carePlans.plantId, plants.id))
          .where(where)
        const hydrated = yield* hydrate(rows)
        return pipe(Array.head(hydrated), Option.getOrNull)
      })

    return {
      findById: Effect.fn('CarePlanRepository.findById')(function* (
        id: string
      ) {
        return yield* findPlan(eq(carePlans.id, id))
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
              authorReachesPlant,
              ...pipe(
                Option.fromNullishOr(status),
                Option.map((s) => [eq(carePlans.status, s)]),
                Option.getOrElse(() => [])
              )
            )
          )
          .orderBy(desc(carePlans.createdAt))
        return yield* hydrate(rows)
      }),

      findByPlant: Effect.fn('CarePlanRepository.findByPlant')(function* (
        plantId: string
      ) {
        const rows = yield* db
          .select({ plan: carePlans, plant: plantSelect })
          .from(carePlans)
          .innerJoin(plants, eq(carePlans.plantId, plants.id))
          .where(eq(carePlans.plantId, plantId))
          .orderBy(desc(carePlans.createdAt))
        return yield* hydrate(rows)
      }),
    }
  })
)
