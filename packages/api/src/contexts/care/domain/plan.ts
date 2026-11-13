import type { CareType } from '@lily/shared'
import type { CarePlanStatus } from '@lily/shared/care-plan'
import { Array, Data, DateTime, Option, Order, pipe, Record } from 'effect'

export type PlanStatus = CarePlanStatus

export interface PlanStep {
  readonly id: string
  readonly position: number
  readonly careType: Option.Option<CareType>
  readonly dueAt: Option.Option<DateTime.Utc>
  readonly done: boolean
}

export interface Plan {
  readonly id: string
  readonly status: PlanStatus
  readonly createdAt: DateTime.Utc
  readonly steps: ReadonlyArray<PlanStep>
}

export interface ProposedStep {
  readonly title: string
  readonly description: Option.Option<string>
  readonly careType: Option.Option<CareType>
  readonly dueAt: Option.Option<DateTime.Utc>
}

export type Rule = Data.TaggedEnum<{
  Stay: Record<never, never>
  Become: { readonly status: 'accepted' | 'dismissed' }
  RefuseAsNotProposed: Record<never, never>
}>
export const Rule = Data.taggedEnum<Rule>()

type RuleOf<T extends Rule['_tag']> = Extract<Rule, { readonly _tag: T }>
export type NeverRefused = RuleOf<'Stay' | 'Become'>
type OnAnyStatus = RuleOf<'Stay'>

const stay: RuleOf<'Stay'> = Rule.Stay()
const refuse: RuleOf<'RefuseAsNotProposed'> = Rule.RefuseAsNotProposed()
const become = (status: RuleOf<'Become'>['status']): RuleOf<'Become'> =>
  Rule.Become({ status })

const onAnyStatus = {
  proposed: stay,
  accepted: stay,
  dismissed: stay,
  completed: stay,
} as const

export const RULES = {
  Accept: {
    proposed: become('accepted'),
    accepted: refuse,
    dismissed: refuse,
    completed: refuse,
  },
  Dismiss: {
    proposed: become('dismissed'),
    accepted: refuse,
    dismissed: refuse,
    completed: refuse,
  },
  Delete: onAnyStatus,
  TickStep: onAnyStatus,
  UntickStep: onAnyStatus,
  DropStep: onAnyStatus,
  LinkToDiagnosis: onAnyStatus,
} as const satisfies {
  readonly Accept: Record<PlanStatus, Rule>
  readonly Dismiss: Record<PlanStatus, Rule>
  readonly Delete: Record<PlanStatus, OnAnyStatus>
  readonly TickStep: Record<PlanStatus, OnAnyStatus>
  readonly UntickStep: Record<PlanStatus, OnAnyStatus>
  readonly DropStep: Record<PlanStatus, OnAnyStatus>
  readonly LinkToDiagnosis: Record<PlanStatus, OnAnyStatus>
}

export type PlanCommand = keyof typeof RULES

export const DEAD_PLANT_TAKES = {
  Propose: false,
  Accept: false,
  Dismiss: false,
  Delete: true,
  TickStep: false,
  UntickStep: false,
  DropStep: false,
  LinkToDiagnosis: false,
} as const satisfies Record<PlanCommand | 'Propose', boolean>

const isOpen = (step: PlanStep) => !step.done

const everyStepIsDone = (steps: ReadonlyArray<PlanStep>) =>
  Array.isReadonlyArrayNonEmpty(steps) && !Array.some(steps, isOpen)

export type SettledStatus = 'accepted' | 'completed'

const SETTLES_AS = {
  proposed: () => Option.none(),
  dismissed: () => Option.none(),
  accepted: (steps) =>
    everyStepIsDone(steps) ? Option.some('completed') : Option.none(),
  completed: (steps) =>
    Array.some(steps, isOpen) ? Option.some('accepted') : Option.none(),
} satisfies Record<
  PlanStatus,
  (steps: ReadonlyArray<PlanStep>) => Option.Option<SettledStatus>
>

export const statusToSettleInto = (
  plan: Pick<Plan, 'status' | 'steps'>
): Option.Option<SettledStatus> => SETTLES_AS[plan.status](plan.steps)

export interface DueTarget {
  readonly careType: CareType
  readonly dueAt: DateTime.Utc
}

const soonestFirst = Order.mapInput(
  DateTime.Order,
  (target: DueTarget) => target.dueAt
)

export const earliestOpenDuePerCareType = (
  steps: ReadonlyArray<PlanStep>
): ReadonlyArray<DueTarget> =>
  pipe(
    steps,
    Array.filter(isOpen),
    Array.flatMap((step) =>
      Option.toArray(Option.all({ careType: step.careType, dueAt: step.dueAt }))
    ),
    Array.groupBy((target): string => target.careType),
    Record.values,
    Array.map(Array.min(soonestFirst))
  )

export interface StepOfPlan {
  readonly plan: Plan
  readonly step: PlanStep
}

const oldestPlanFirst = Order.mapInput(
  DateTime.Order,
  (plan: Plan) => plan.createdAt
)
const byPosition = Order.mapInput(
  Order.Number,
  (step: PlanStep) => step.position
)

const openStepsOf = (plan: Plan): ReadonlyArray<StepOfPlan> =>
  pipe(
    plan.steps,
    Array.filter(isOpen),
    Array.sort(byPosition),
    Array.map((step) => ({ plan, step }))
  )

export const earliestOpenStepOfAcceptedPlans = (
  plans: ReadonlyArray<Plan>,
  careType: CareType
): Option.Option<StepOfPlan> =>
  pipe(
    plans,
    Array.filter((plan) => plan.status === 'accepted'),
    Array.sort(oldestPlanFirst),
    Array.flatMap(openStepsOf),
    Array.findFirst(({ step }) => Option.contains(step.careType, careType))
  )

export const openStepNamed = (
  plans: ReadonlyArray<Plan>,
  stepId: string
): Option.Option<StepOfPlan> =>
  pipe(
    plans,
    Array.flatMap(openStepsOf),
    Array.findFirst(({ step }) => step.id === stepId)
  )

const withStep = (plan: Plan, stepId: string, done: boolean): Plan => ({
  ...plan,
  steps: Array.map(plan.steps, (step) =>
    step.id === stepId ? { ...step, done } : step
  ),
})

export const withStepDone = (plan: Plan, stepId: string): Plan =>
  withStep(plan, stepId, true)

export const withStepOpen = (plan: Plan, stepId: string): Plan =>
  withStep(plan, stepId, false)

export const withoutStep = (plan: Plan, stepId: string): Plan => ({
  ...plan,
  steps: Array.filter(plan.steps, (step) => step.id !== stepId),
})
