import {
  CarePlanRepository,
  type CarePlanRow,
  type CarePlanStepRow,
  type ICarePlanRepository,
  mapToCarePlan,
} from '@lily/api/repositories/care-plan.repository'
import type { CarePlanStatus } from '@lily/shared'
import { Array, Effect, Layer, Option, Order, pipe } from 'effect'

export interface MockCarePlanPlant {
  id: string
  name: string
  imageUrl: string | null
}

export interface MockCarePlanData {
  plans?: CarePlanRow[]
  steps?: CarePlanStepRow[]
  plants?: MockCarePlanPlant[]
}

const createdAtDesc: Order.Order<CarePlanRow> = Order.flip(
  Order.mapInput(Order.Date, (p: CarePlanRow) => p.createdAt)
)

export const createCarePlanRows = (data: MockCarePlanData = {}) => {
  const plans: CarePlanRow[] = pipe(
    Option.fromNullishOr(data.plans),
    Option.getOrElse(() => [] as CarePlanRow[]),
    Array.map((p) => ({ ...p }))
  )
  const steps: CarePlanStepRow[] = pipe(
    Option.fromNullishOr(data.steps),
    Option.getOrElse(() => [] as CarePlanStepRow[]),
    Array.map((s) => ({ ...s }))
  )
  const plants = pipe(
    Option.fromNullishOr(data.plants),
    Option.getOrElse(() => [] as MockCarePlanPlant[])
  )

  const plantInfo = (plantId: string) =>
    pipe(
      Array.findFirst(plants, (p) => p.id === plantId),
      Option.map((p) => ({ name: p.name, imageUrl: p.imageUrl })),
      Option.getOrElse(() => ({ name: 'Unknown plant', imageUrl: null }))
    )

  const stepsOf = (planId: string) =>
    Array.filter(steps, (s) => s.planId === planId)

  const toPlan = (row: CarePlanRow) =>
    mapToCarePlan(row, plantInfo(row.plantId), stepsOf(row.id))

  const repo: ICarePlanRepository = {
    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(plans, (p) => p.id === id),
          Option.map(toPlan),
          Option.getOrNull
        )
      ),

    findByUser: (userId: string, status?: CarePlanStatus) =>
      Effect.succeed(
        pipe(
          plans,
          Array.filter(
            (p) =>
              p.userId === userId &&
              pipe(
                Option.fromNullishOr(status),
                Option.match({
                  onNone: () => true,
                  onSome: (s) => p.status === s,
                })
              )
          ),
          Array.sort(createdAtDesc),
          Array.map(toPlan)
        )
      ),

    findByPlant: (plantId: string) =>
      Effect.succeed(
        pipe(
          plans,
          Array.filter((p) => p.plantId === plantId),
          Array.sort(createdAtDesc),
          Array.map(toPlan)
        )
      ),
  }

  return { plans, steps, layer: Layer.succeed(CarePlanRepository, repo) }
}

export type CarePlanRows = ReturnType<typeof createCarePlanRows>

export const createMockCarePlanRepository = (
  data: MockCarePlanData = {}
): Layer.Layer<CarePlanRepository> => createCarePlanRows(data).layer
