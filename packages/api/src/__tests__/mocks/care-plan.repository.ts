import {
  CarePlanRepository,
  type CarePlanRow,
  type CarePlanStepRow,
  type CompleteStepData,
  type CreateCarePlanData,
  type ICarePlanRepository,
  isStepOpen,
  mapToCarePlan,
  mapToCarePlanStep,
  type UpdateCarePlanStatusData,
} from '@lily/api/repositories/care-plan.repository'
import type { CarePlanStatus, CareType } from '@lily/shared'
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

const createdAtDesc: Order.Order<CarePlanRow> = Order.reverse(
  Order.mapInput(Order.Date, (p: CarePlanRow) => p.createdAt)
)

/**
 * In-memory CarePlanRepository. Mutations replace rows in the backing arrays
 * so tests can read back through `findById` after acting on a plan.
 */
export const createMockCarePlanRepository = (
  data: MockCarePlanData = {}
): Layer.Layer<CarePlanRepository> => {
  const plans: CarePlanRow[] = pipe(
    Option.fromNullable(data.plans),
    Option.getOrElse(() => [] as CarePlanRow[]),
    Array.map((p) => ({ ...p }))
  )
  const steps: CarePlanStepRow[] = pipe(
    Option.fromNullable(data.steps),
    Option.getOrElse(() => [] as CarePlanStepRow[]),
    Array.map((s) => ({ ...s }))
  )
  const plants = pipe(
    Option.fromNullable(data.plants),
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

  const findRow = (id: string, userId: string) =>
    Array.findFirst(plans, (p) => p.id === id && p.userId === userId)

  const replacePlan = (updated: CarePlanRow) => {
    const idx = Array.findFirstIndex(plans, (p) => p.id === updated.id)
    Option.map(idx, (i) => {
      plans[i] = updated
    })
  }

  const replaceStep = (updated: CarePlanStepRow) => {
    const idx = Array.findFirstIndex(steps, (s) => s.id === updated.id)
    Option.map(idx, (i) => {
      steps[i] = updated
    })
  }

  const markStep = (
    step: CarePlanStepRow,
    completion: CompleteStepData
  ): CarePlanStepRow => {
    const updated: CarePlanStepRow = {
      ...step,
      completedAt: completion.completedAt,
      careLogId: pipe(
        Option.fromNullable(completion.careLogId),
        Option.getOrNull
      ),
      updatedAt: new Date(),
    }
    replaceStep(updated)
    return updated
  }

  const repo: ICarePlanRepository = {
    create: (input: CreateCarePlanData) => {
      const now = new Date()
      const plan: CarePlanRow = {
        id: `care-plan-${crypto.randomUUID()}`,
        plantId: input.plantId,
        userId: input.userId,
        chatMessageId: pipe(
          Option.fromNullable(input.chatMessageId),
          Option.getOrNull
        ),
        diagnosisId: pipe(
          Option.fromNullable(input.diagnosisId),
          Option.getOrNull
        ),
        title: input.title,
        source: pipe(
          Option.fromNullable(input.source),
          Option.getOrElse(() => 'ai' as const)
        ),
        status: 'proposed',
        acceptedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      }
      plans.push(plan)
      Array.forEach(input.steps, (step, index) => {
        steps.push({
          id: `care-plan-step-${crypto.randomUUID()}`,
          planId: plan.id,
          position: index,
          title: step.title,
          description: pipe(
            Option.fromNullable(step.description),
            Option.getOrNull
          ),
          careType: pipe(Option.fromNullable(step.careType), Option.getOrNull),
          dueDate: pipe(Option.fromNullable(step.dueDate), Option.getOrNull),
          completedAt: null,
          careLogId: null,
          createdAt: now,
          updatedAt: now,
        })
      })
      return Effect.succeed(toPlan(plan))
    },

    findById: (id: string, userId: string) =>
      Effect.succeed(
        pipe(findRow(id, userId), Option.map(toPlan), Option.getOrNull)
      ),

    findByUser: (userId: string, status?: CarePlanStatus) =>
      Effect.succeed(
        pipe(
          plans,
          Array.filter(
            (p) =>
              p.userId === userId &&
              pipe(
                Option.fromNullable(status),
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

    findByPlant: (plantId: string, userId: string) =>
      Effect.succeed(
        pipe(
          plans,
          Array.filter((p) => p.plantId === plantId && p.userId === userId),
          Array.sort(createdAtDesc),
          Array.map(toPlan)
        )
      ),

    updateStatus: (
      id: string,
      userId: string,
      update: UpdateCarePlanStatusData
    ) =>
      Effect.succeed(
        pipe(
          findRow(id, userId),
          Option.map((row) => {
            const updated: CarePlanRow = {
              ...row,
              status: update.status,
              acceptedAt:
                update.acceptedAt !== undefined
                  ? update.acceptedAt
                  : row.acceptedAt,
              completedAt:
                update.completedAt !== undefined
                  ? update.completedAt
                  : row.completedAt,
              updatedAt: new Date(),
            }
            replacePlan(updated)
            return toPlan(updated)
          }),
          Option.getOrNull
        )
      ),

    linkChatMessage: (planId: string, chatMessageId: string) => {
      pipe(
        Array.findFirst(plans, (p) => p.id === planId),
        Option.map((row) => replacePlan({ ...row, chatMessageId }))
      )
      return Effect.void
    },

    delete: (id: string, userId: string) => {
      const idx = Array.findFirstIndex(
        plans,
        (p) => p.id === id && p.userId === userId
      )
      Option.map(idx, (i) => {
        plans.splice(i, 1)
      })
      const remaining = Array.filter(steps, (s) => s.planId !== id)
      steps.splice(0, steps.length, ...remaining)
      return Effect.void
    },

    completeStep: (stepId: string, completion: CompleteStepData) =>
      Effect.succeed(
        pipe(
          Array.findFirst(steps, (s) => s.id === stepId),
          Option.map((step) => mapToCarePlanStep(markStep(step, completion))),
          Option.getOrNull
        )
      ),

    uncompleteStep: (stepId: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(steps, (s) => s.id === stepId),
          Option.map((step) => {
            const updated: CarePlanStepRow = {
              ...step,
              completedAt: null,
              careLogId: null,
              updatedAt: new Date(),
            }
            replaceStep(updated)
            return mapToCarePlanStep(updated)
          }),
          Option.getOrNull
        )
      ),

    deleteStep: (stepId: string) => {
      const idx = Array.findFirstIndex(steps, (s) => s.id === stepId)
      Option.map(idx, (i) => {
        steps.splice(i, 1)
      })
      return Effect.void
    },

    completeEarliestOpenStep: (
      plantId: string,
      careType: CareType,
      completion: CompleteStepData
    ) => {
      const acceptedPlans = pipe(
        plans,
        Array.filter((p) => p.plantId === plantId && p.status === 'accepted'),
        Array.sort(Order.mapInput(Order.Date, (p: CarePlanRow) => p.createdAt))
      )
      const target = pipe(
        acceptedPlans,
        Array.flatMap((p) =>
          pipe(
            stepsOf(p.id),
            Array.filter((s) => s.careType === careType && isStepOpen(s)),
            Array.sort(
              Order.mapInput(Order.number, (s: CarePlanStepRow) => s.position)
            )
          )
        ),
        Array.head
      )
      return Effect.succeed(
        pipe(
          target,
          Option.map((step) => mapToCarePlanStep(markStep(step, completion))),
          Option.getOrNull
        )
      )
    },

    settleCompletion: (planId: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(plans, (p) => p.id === planId),
          Option.map((row) => {
            const planSteps = stepsOf(planId)
            const allDone =
              Array.isNonEmptyReadonlyArray(planSteps) &&
              !Array.some(planSteps, isStepOpen)
            if (row.status === 'accepted' && allDone) {
              const updated: CarePlanRow = {
                ...row,
                status: 'completed',
                completedAt: new Date(),
                updatedAt: new Date(),
              }
              replacePlan(updated)
              return toPlan(updated)
            }
            return toPlan(row)
          }),
          Option.getOrNull
        )
      ),
  }

  return Layer.succeed(CarePlanRepository, repo)
}
