import {
  type CarePlant,
  CareWhen,
  type DecideEnv,
  PlanStepChoice,
} from '@lily/api/contexts/care/domain/care-plant'
import {
  CareWrite,
  completeStep,
  type Decision,
  DueMove,
  moveDueDay,
  Refusal,
  type RefusalOf,
  recordCare,
  settleWrites,
} from '@lily/api/contexts/care/domain/decide'
import {
  DEAD_PLANT_TAKES,
  earliestOpenDuePerCareType,
  type NeverRefused,
  type Plan,
  type PlanCommand,
  type PlanStep,
  type ProposedStep,
  RULES,
  type Rule,
  withoutStep,
  withStepOpen,
} from '@lily/api/contexts/care/domain/plan'
import { decision } from '@lily/api/kernel/transact'
import type { CarePlanSource } from '@lily/shared/care-plan'
import { Array, type DateTime, Match, Option, Result } from 'effect'

interface Held {
  readonly plant: CarePlant
  readonly plan: Plan
}

export type NoSuchPlan = RefusalOf<'PlanGone' | 'PlanOfDeadPlant'>
export type AnswerRefusal = NoSuchPlan | RefusalOf<'PlanNotProposed'>
export type StepRefusal = NoSuchPlan | RefusalOf<'StepGone'>
export type ProposeRefusal = RefusalOf<'PlantGone' | 'ProposalForDeadPlant'>

export interface Proposal {
  readonly planId: string
  readonly plantId: string
  readonly authorId: string
  readonly title: string
  readonly source: CarePlanSource
  readonly steps: ReadonlyArray<ProposedStep>
}

export const proposePlan = (
  plant: Option.Option<CarePlant>,
  proposal: Proposal
): Result.Result<Decision<{ readonly planId: string }>, ProposeRefusal> =>
  Result.gen(function* () {
    const { plantId, planId } = proposal
    const found = yield* Result.fromOption(plant, () =>
      Refusal.PlantGone({ plantId })
    )
    if (found.life._tag === 'Dead' && !DEAD_PLANT_TAKES.Propose) {
      return yield* Result.fail(Refusal.ProposalForDeadPlant({ plantId }))
    }
    return decision({ planId }, [CareWrite.InsertPlan(proposal)])
  })

const heldPlan = (
  plant: Option.Option<CarePlant>,
  planId: string,
  command: PlanCommand
): Result.Result<Held, NoSuchPlan> =>
  Result.gen(function* () {
    const gone = () => Refusal.PlanGone({ planId })
    const found = yield* Result.fromOption(plant, gone)
    const plan = yield* Result.fromOption(
      Array.findFirst(found.plans, (candidate) => candidate.id === planId),
      gone
    )
    return yield* found.life._tag === 'Dead' && !DEAD_PLANT_TAKES[command]
      ? Result.fail(Refusal.PlanOfDeadPlant({ planId }))
      : Result.succeed({ plant: found, plan })
  })

const heldStep = (
  plan: Plan,
  stepId: string
): Result.Result<PlanStep, RefusalOf<'StepGone'>> =>
  Result.fromOption(
    Array.findFirst(plan.steps, (step) => step.id === stepId),
    () => Refusal.StepGone({ planId: plan.id, stepId })
  )

interface Ruled {
  readonly plan: Plan
  readonly writes: ReadonlyArray<CareWrite>
}

const under = (rule: NeverRefused, plan: Plan, at: DateTime.Utc): Ruled =>
  Match.value(rule).pipe(
    Match.tagsExhaustive({
      Stay: (): Ruled => ({ plan, writes: [] }),
      Become: ({ status }): Ruled => ({
        plan: { ...plan, status },
        writes: [
          CareWrite.SetPlanStatus({
            planId: plan.id,
            from: plan.status,
            to: status,
            at,
          }),
        ],
      }),
    })
  )

const answered = (
  rule: Rule,
  plan: Plan,
  at: DateTime.Utc
): Result.Result<Ruled, RefusalOf<'PlanNotProposed'>> =>
  rule._tag === 'RefuseAsNotProposed'
    ? Result.fail(
        Refusal.PlanNotProposed({ planId: plan.id, status: plan.status })
      )
    : Result.succeed(under(rule, plan, at))

export const acceptPlan = (
  plant: Option.Option<CarePlant>,
  planId: string,
  now: DateTime.Utc
): Result.Result<Decision<void>, AnswerRefusal> =>
  Result.gen(function* () {
    const held = yield* heldPlan(plant, planId, 'Accept')
    const ruled = yield* answered(
      RULES.Accept[held.plan.status],
      held.plan,
      now
    )
    const moved = Array.map(
      earliestOpenDuePerCareType(ruled.plan.steps),
      ({ careType, dueAt }) =>
        moveDueDay(
          held.plant,
          careType,
          DueMove.To({ instant: dueAt }),
          'carePlan'
        )
    )
    return decision(
      undefined,
      [
        ...ruled.writes,
        ...Array.flatMap(moved, (move) => move.writes),
        ...settleWrites(ruled.plan, now),
      ],
      Array.flatMap(moved, (move) => move.events)
    )
  })

export const dismissPlan = (
  plant: Option.Option<CarePlant>,
  planId: string,
  now: DateTime.Utc
): Result.Result<Decision<void>, AnswerRefusal> =>
  Result.gen(function* () {
    const held = yield* heldPlan(plant, planId, 'Dismiss')
    const ruled = yield* answered(
      RULES.Dismiss[held.plan.status],
      held.plan,
      now
    )
    return decision(undefined, ruled.writes)
  })

export const deletePlan = (
  plant: Option.Option<CarePlant>,
  planId: string,
  now: DateTime.Utc
): Result.Result<Decision<void>, NoSuchPlan> =>
  Result.map(heldPlan(plant, planId, 'Delete'), ({ plan }) =>
    decision(undefined, [
      ...under(RULES.Delete[plan.status], plan, now).writes,
      CareWrite.DeletePlan({ planId }),
    ])
  )

export const tickStep = (
  plant: Option.Option<CarePlant>,
  planId: string,
  stepId: string,
  env: DecideEnv
): Result.Result<Decision<void>, StepRefusal> =>
  Result.gen(function* () {
    const held = yield* heldPlan(plant, planId, 'TickStep')
    const ruled = under(RULES.TickStep[held.plan.status], held.plan, env.now)
    const step = yield* heldStep(ruled.plan, stepId)
    if (step.done) return decision(undefined, ruled.writes)

    const withoutCare = (): Decision<void> =>
      decision(
        undefined,
        completeStep({ plan: ruled.plan, step }, Option.none(), env.now)
      )
    const ticked = Option.match(step.careType, {
      onNone: withoutCare,
      onSome: (careType) =>
        Result.match(
          recordCare(
            held.plant,
            {
              careType,
              on: CareWhen.Today(),
              notes: Option.none(),
              photoUrl: Option.none(),
              planStep: PlanStepChoice.Step({ id: step.id }),
            },
            env
          ),
          {
            onSuccess: (recorded): Decision<void> =>
              decision(undefined, recorded.writes, recorded.events),
            onFailure: withoutCare,
          }
        ),
    })
    return decision(
      undefined,
      [...ruled.writes, ...ticked.writes],
      ticked.events
    )
  })

export const untickStep = (
  plant: Option.Option<CarePlant>,
  planId: string,
  stepId: string,
  now: DateTime.Utc
): Result.Result<Decision<void>, StepRefusal> =>
  Result.gen(function* () {
    const held = yield* heldPlan(plant, planId, 'UntickStep')
    const ruled = under(RULES.UntickStep[held.plan.status], held.plan, now)
    const step = yield* heldStep(ruled.plan, stepId)
    return decision(
      undefined,
      step.done
        ? [
            ...ruled.writes,
            CareWrite.ReopenPlanStep({ stepId }),
            ...settleWrites(withStepOpen(ruled.plan, stepId), now),
          ]
        : ruled.writes
    )
  })

export const dropStep = (
  plant: Option.Option<CarePlant>,
  planId: string,
  stepId: string,
  now: DateTime.Utc
): Result.Result<Decision<void>, StepRefusal> =>
  Result.gen(function* () {
    const held = yield* heldPlan(plant, planId, 'DropStep')
    const ruled = under(RULES.DropStep[held.plan.status], held.plan, now)
    yield* heldStep(ruled.plan, stepId)
    return decision(undefined, [
      ...ruled.writes,
      CareWrite.DeletePlanStep({ stepId }),
      ...settleWrites(withoutStep(ruled.plan, stepId), now),
    ])
  })

export const linkPlanToDiagnosis = (
  plant: Option.Option<CarePlant>,
  planId: string,
  diagnosisId: string,
  now: DateTime.Utc
): Result.Result<Decision<void>, NoSuchPlan> =>
  Result.map(heldPlan(plant, planId, 'LinkToDiagnosis'), ({ plan }) =>
    decision(undefined, [
      ...under(RULES.LinkToDiagnosis[plan.status], plan, now).writes,
      CareWrite.LinkPlanToDiagnosis({ planId, diagnosisId }),
    ])
  )
