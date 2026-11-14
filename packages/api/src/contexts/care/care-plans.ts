import type {
  CarePlant,
  DecideEnv,
} from '@lily/api/contexts/care/domain/care-plant'
import {
  type Decision,
  type Refusal,
  type RefusalOf,
  requireActor,
} from '@lily/api/contexts/care/domain/decide'
import { CareTopic } from '@lily/api/contexts/care/domain/events'
import type { ProposedStep } from '@lily/api/contexts/care/domain/plan'
import {
  acceptPlan,
  deletePlan,
  dismissPlan,
  dropStep,
  linkPlanToDiagnosis,
  proposePlan,
  tickStep,
  untickStep,
} from '@lily/api/contexts/care/domain/plan-decide'
import { asError } from '@lily/api/contexts/care/refusals'
import { CareStore } from '@lily/api/contexts/care/store'
import { WeatherAdvisor } from '@lily/api/contexts/care/weather'
import type { Outbox } from '@lily/api/kernel/outbox'
import {
  Actor,
  type PlanPermit,
  type PlantPermit,
} from '@lily/api/kernel/permit'
import { runCommand } from '@lily/api/kernel/transact'
import type { CareType } from '@lily/shared'
import type { CarePlanSource } from '@lily/shared/care-plan'
import type {
  CarePlanNotFoundError,
  CarePlanNotProposedError,
  CarePlanStepNotFoundError,
} from '@lily/shared/errors/care-plan'
import type { PlantNotFoundError } from '@lily/shared/errors/plant'
import {
  Array,
  Context,
  Data,
  DateTime,
  Effect,
  Layer,
  Option,
  Result,
} from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * The one way to change a care plan or one of its steps. Each command locks
 * the plan's plant, so two commands on one plan run one after the other, and
 * a plan on a dead plant answers as a plan that does not exist.
 */
export class CarePlans extends Context.Service<
  CarePlans,
  {
    /**
     * Writes a proposed plan and all its steps, or neither. The author is
     * the user the permit names. A dead plant answers as a plant that does
     * not exist, and so does an author whose account is gone.
     */
    readonly propose: (command: {
      readonly permit: PlantPermit<'chat'>
      readonly title: string
      readonly source: CarePlanSource
      readonly steps: ReadonlyArray<ProposedStep>
    }) => Effect.Effect<{ readonly planId: string }, PlantNotFoundError>
    /**
     * Moves the due day of each care type to its earliest dated open step,
     * in the transaction that accepts the plan. A refused accept moves none.
     * A plan whose steps are all done is completed at once.
     */
    readonly accept: (command: {
      readonly permit: PlanPermit<'manage'>
    }) => Effect.Effect<void, CarePlanNotFoundError | CarePlanNotProposedError>
    readonly dismiss: (command: {
      readonly permit: PlanPermit<'manage'>
    }) => Effect.Effect<void, CarePlanNotFoundError | CarePlanNotProposedError>
    /** The one plan command a dead plant still takes. */
    readonly delete: (command: {
      readonly permit: PlanPermit<'manage'>
    }) => Effect.Effect<void, CarePlanNotFoundError>
    /**
     * A step with a care type records that care for today. When today's care
     * was already given, the step is ticked without one. A step already done
     * is left as it is. Ticking the last open step of an accepted plan
     * completes the plan. A ticker whose account is gone is answered that
     * the plant does not exist.
     */
    readonly tickStep: (command: {
      readonly permit: PlanPermit<'tick'>
      readonly stepId: string
    }) => Effect.Effect<
      void,
      CarePlanNotFoundError | CarePlanStepNotFoundError | PlantNotFoundError
    >
    /**
     * Reopens the step and, with it, a completed plan. The care a tick
     * recorded stays.
     */
    readonly untickStep: (command: {
      readonly permit: PlanPermit<'tick'>
      readonly stepId: string
    }) => Effect.Effect<void, CarePlanNotFoundError | CarePlanStepNotFoundError>
    /**
     * Dropping the last open step of an accepted plan completes it. A plan
     * left with no step at all is not completed.
     */
    readonly dropStep: (command: {
      readonly permit: PlanPermit<'manage'>
      readonly stepId: string
    }) => Effect.Effect<void, CarePlanNotFoundError | CarePlanStepNotFoundError>
    /**
     * For the caller that proposes a plan and writes its diagnosis in one
     * transaction: `propose` first, so the plant lock is taken before the
     * diagnosis row references the plant, then the diagnosis, then this.
     */
    readonly linkToDiagnosis: (command: {
      readonly permit: PlantPermit<'chat'>
      readonly planId: string
      readonly diagnosisId: string
    }) => Effect.Effect<void, CarePlanNotFoundError>
    /**
     * The one plan write that takes no plant lock and opens no transaction:
     * a single statement on a column no rule reads. A plan deleted in
     * between is left alone. It fails with the database error, so the chat
     * save that calls it can retry.
     */
    readonly linkToMessage: (command: {
      readonly planId: string
      readonly chatMessageId: string
    }) => Effect.Effect<void, SqlError>
  }
>()('care/CarePlans') {}

export class ProposalByAJobDefect extends Data.TaggedError(
  'ProposalByAJobDefect'
)<{
  readonly plantId: string
  readonly job: string
}> {}

export const CarePlansLive = Layer.effect(
  CarePlans,
  Effect.gen(function* () {
    const store = yield* CareStore
    const advisor = yield* WeatherAdvisor
    const context = yield* Effect.context<Outbox | SqlClient.SqlClient>()

    const onPlantOf = <A, R extends Refusal>(
      name: string,
      permit: { readonly plantId: string },
      careTypes: ReadonlyArray<CareType>,
      decide: (plant: Option.Option<CarePlant>) => Result.Result<Decision<A>, R>
    ) =>
      runCommand({
        name,
        topic: CareTopic,
        load: store.lockAndLoad([permit.plantId], careTypes),
        decide: (plants) =>
          decide(Option.fromNullishOr(plants.get(permit.plantId))),
        apply: store.apply,
      }).pipe(
        Effect.provide(context),
        Effect.mapError((refusal: R) => asError(refusal))
      )

    const onPlantOfBy = <A, R extends Refusal>(
      name: string,
      permit: { readonly plantId: string },
      by: string,
      careTypes: ReadonlyArray<CareType>,
      decide: (plant: Option.Option<CarePlant>) => Result.Result<Decision<A>, R>
    ) =>
      runCommand({
        name,
        topic: CareTopic,
        load: store.lockAndLoadFor([by], [permit.plantId], careTypes),
        decide: ({
          plants,
          accountsHeld,
        }): Result.Result<Decision<A>, R | RefusalOf<'ActorGone'>> =>
          Result.flatMap(requireActor(accountsHeld, by, permit.plantId), () =>
            decide(Option.fromNullishOr(plants.get(permit.plantId)))
          ),
        apply: store.apply,
      }).pipe(
        Effect.provide(context),
        Effect.mapError((refusal: R | RefusalOf<'ActorGone'>) =>
          asError(refusal)
        )
      )

    const authorOf = (permit: PlantPermit<'chat'>) =>
      Actor.$match(permit.actor, {
        User: ({ userId }) => Effect.succeed(userId),
        System: ({ job }) =>
          Effect.die(
            new ProposalByAJobDefect({ plantId: permit.plantId, job })
          ),
      })

    const careTypesOf = (permit: { readonly planId: string }) =>
      store
        .careTypesOfPlan(permit.planId)
        .pipe(Effect.catchTag('SqlError', Effect.die))

    const tickEnv = (
      permit: PlanPermit<'tick'>,
      careTypes: ReadonlyArray<CareType>
    ) =>
      Effect.gen(function* () {
        const wateringDays = Array.contains(careTypes, 'watering')
          ? yield* advisor.wateringDays([permit.plantId])
          : new Map<string, number>()
        const now = yield* DateTime.now
        return {
          now,
          newCareLogId: crypto.randomUUID(),
          wateringDays: Option.fromNullishOr(wateringDays.get(permit.plantId)),
          by: Option.some(permit.by),
        } satisfies DecideEnv
      })

    return CarePlans.of({
      propose: ({ permit, title, source, steps }) =>
        Effect.flatMap(authorOf(permit), (authorId) =>
          onPlantOfBy('care.proposePlan', permit, authorId, [], (plant) =>
            proposePlan(plant, {
              planId: crypto.randomUUID(),
              plantId: permit.plantId,
              authorId,
              title,
              source,
              steps,
            })
          )
        ),
      accept: ({ permit }) =>
        Effect.gen(function* () {
          const careTypes = yield* careTypesOf(permit)
          const now = yield* DateTime.now
          yield* onPlantOf('care.acceptPlan', permit, careTypes, (plant) =>
            acceptPlan(plant, permit.planId, now)
          )
        }),
      dismiss: ({ permit }) =>
        Effect.flatMap(DateTime.now, (now) =>
          onPlantOf('care.dismissPlan', permit, [], (plant) =>
            dismissPlan(plant, permit.planId, now)
          )
        ),
      delete: ({ permit }) =>
        Effect.flatMap(DateTime.now, (now) =>
          onPlantOf('care.deletePlan', permit, [], (plant) =>
            deletePlan(plant, permit.planId, now)
          )
        ),
      tickStep: ({ permit, stepId }) =>
        Effect.gen(function* () {
          const careTypes = yield* careTypesOf(permit)
          const env = yield* tickEnv(permit, careTypes)
          yield* onPlantOfBy(
            'care.tickPlanStep',
            permit,
            permit.by,
            careTypes,
            (plant) => tickStep(plant, permit.planId, stepId, env)
          )
        }),
      untickStep: ({ permit, stepId }) =>
        Effect.flatMap(DateTime.now, (now) =>
          onPlantOf('care.untickPlanStep', permit, [], (plant) =>
            untickStep(plant, permit.planId, stepId, now)
          )
        ),
      dropStep: ({ permit, stepId }) =>
        Effect.flatMap(DateTime.now, (now) =>
          onPlantOf('care.dropPlanStep', permit, [], (plant) =>
            dropStep(plant, permit.planId, stepId, now)
          )
        ),
      linkToDiagnosis: ({ permit, planId, diagnosisId }) =>
        Effect.flatMap(DateTime.now, (now) =>
          onPlantOf('care.linkPlanToDiagnosis', permit, [], (plant) =>
            linkPlanToDiagnosis(plant, planId, diagnosisId, now)
          )
        ),
      linkToMessage: ({ planId, chatMessageId }) =>
        store
          .linkPlanToMessage(planId, chatMessageId)
          .pipe(Effect.withSpan('care.linkPlanToMessage')),
    })
  })
)
