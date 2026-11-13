import {
  type CarePlant,
  CareWhen,
  type DecideEnv,
  type Frequency,
  type PlanStepChoice,
} from '@lily/api/contexts/care/domain/care-plant'
import {
  type AmendInput,
  type AmendRefusal,
  amendCare,
  correctLastCare,
  type Decision,
  type DueMove,
  mergeDecisions,
  moveDueDay,
  type Recorded,
  RecordOutcome,
  type RecordRefusal,
  Refusal,
  type RemoveRefusal,
  recordCareOnAll,
  removeCare,
  type SkipReason,
  setSchedule,
} from '@lily/api/contexts/care/domain/decide'
import {
  CareTopic,
  type ScheduleChangeReason,
} from '@lily/api/contexts/care/domain/events'
import { asError } from '@lily/api/contexts/care/refusals'
import { CareStore } from '@lily/api/contexts/care/store'
import { WeatherAdvisor } from '@lily/api/contexts/care/weather'
import type { Outbox } from '@lily/api/kernel/outbox'
import {
  actingUserId,
  type PlantAction,
  type PlantPermit,
} from '@lily/api/kernel/permit'
import { decision, runCommand } from '@lily/api/kernel/transact'
import type { CareType } from '@lily/shared'
import type { CareLogNotFoundError } from '@lily/shared/errors/care-log'
import {
  type AlreadyCaredTodayError,
  type FutureDateNotAllowedError,
  type PlantIsDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import {
  Array,
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Order,
  pipe,
  Result,
} from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'

export interface RecordCare {
  readonly careType: CareType
  readonly on: CareWhen
  readonly notes: Option.Option<string>
  readonly photoUrl: Option.Option<string>
  readonly planStep: PlanStepChoice
}

export type RecordOneError =
  | AlreadyCaredTodayError
  | FutureDateNotAllowedError
  | PlantIsDeadError
  | PlantNotFoundError

export type AmendCareError =
  | CareLogNotFoundError
  | AlreadyCaredTodayError
  | FutureDateNotAllowedError

export interface DueDayMove {
  readonly plantId: string
  readonly careType: CareType
  readonly move: DueMove
}

export interface LastCareCorrection {
  readonly careType: CareType
  readonly on: CareWhen
}

/**
 * The one way to change a plant's cares and schedules. Each command locks
 * the plant, applies the rules, writes, and records what happened for other
 * contexts, in a single transaction.
 */
export class Care extends Context.Service<
  Care,
  {
    /**
     * Records the same care on many plants. A plant that refuses is skipped
     * and reported; the others are still recorded.
     */
    readonly record: (
      command: RecordCare & {
        readonly permits: ReadonlyArray<PlantPermit<'care'>>
      }
    ) => Effect.Effect<ReadonlyArray<RecordOutcome>>
    readonly recordOne: (
      command: RecordCare & { readonly permit: PlantPermit<'care'> }
    ) => Effect.Effect<Recorded, RecordOneError>
    /**
     * Edits one care of the permit's plant. A field left out is kept. Moving
     * the latest care moves the due day with it.
     */
    readonly amend: (
      command: AmendInput & {
        readonly permit: PlantPermit<'care'>
        readonly careLogId: string
      }
    ) => Effect.Effect<void, AmendCareError>
    readonly remove: (command: {
      readonly permit: PlantPermit<'care'>
      readonly careLogId: string
    }) => Effect.Effect<void, CareLogNotFoundError>
    /**
     * "The last care was on that day", for one or more care types at once:
     * the latest care moves there, or one is recorded when there is none.
     */
    readonly correctLastCare: (command: {
      readonly permit: PlantPermit<'care'>
      readonly corrections: ReadonlyArray<LastCareCorrection>
    }) => Effect.Effect<void, RecordOneError>
    /**
     * Sets how often each care is due, or stops scheduling it (`None`). A
     * care type left out keeps its schedule.
     */
    readonly setSchedules: (command: {
      readonly permit: PlantPermit<'edit'>
      readonly frequencies: ReadonlyArray<
        readonly [CareType, Option.Option<Frequency>]
      >
    }) => Effect.Effect<void, PlantIsDeadError | PlantNotFoundError>
    /**
     * Moves due days without a care, for one reason. A plant that is gone or
     * dead and a line without a schedule are left alone.
     */
    readonly moveDueDays: (command: {
      readonly reason: ScheduleChangeReason
      readonly moves: ReadonlyArray<DueDayMove>
    }) => Effect.Effect<void>
  }
>()('care/Care') {}

export const oneOutcome = (
  permit: PlantPermit<'care'>,
  outcomes: ReadonlyArray<RecordOutcome>
): Effect.Effect<Recorded, RecordOneError> =>
  pipe(
    Array.head(outcomes),
    Option.match({
      onNone: () =>
        Effect.fail(new PlantNotFoundError({ plantId: permit.plantId })),
      onSome: RecordOutcome.$match({
        Recorded: (recorded): Effect.Effect<Recorded, RecordOneError> =>
          Effect.succeed(recorded),
        Skipped: ({ reason }) => Effect.fail(asError(reason)),
      }),
    })
  )

export const CareLive = Layer.effect(
  Care,
  Effect.gen(function* () {
    const store = yield* CareStore
    const advisor = yield* WeatherAdvisor
    const context = yield* Effect.context<Outbox | SqlClient.SqlClient>()

    const record: Care['Service']['record'] = (command) =>
      Effect.gen(function* () {
        const permits = pipe(
          command.permits,
          Array.dedupeWith((a, b) => a.plantId === b.plantId),
          Array.sort(
            Order.mapInput(
              Order.String,
              (permit: PlantPermit<'care'>) => permit.plantId
            )
          )
        )
        if (!Array.isReadonlyArrayNonEmpty(permits)) return []
        const plantIds = Array.map(permits, (permit) => permit.plantId)

        const wateringDays =
          command.careType === 'watering' && CareWhen.$is('Today')(command.on)
            ? yield* advisor.wateringDays(plantIds)
            : new Map<string, number>()
        const now = yield* DateTime.now
        const envOf = (permit: PlantPermit<'care'>): DecideEnv => ({
          now,
          newCareLogId: crypto.randomUUID(),
          wateringDays: Option.fromNullishOr(wateringDays.get(permit.plantId)),
          by: Option.fromNullishOr(actingUserId(permit)),
        })

        return yield* runCommand({
          name: 'care.record',
          topic: CareTopic,
          load: store.lockAndLoad(plantIds, [command.careType]),
          decide: (plants) => {
            const present = Array.flatMap(permits, (permit) =>
              pipe(
                Option.fromNullishOr(plants.get(permit.plantId)),
                Option.match({
                  onNone: () => [],
                  onSome: (plant) => [[plant, envOf(permit)] as const],
                })
              )
            )
            const gone = Array.filter(plantIds, (id) => !plants.has(id))
            const decided = recordCareOnAll(present, command)
            return Result.succeed(
              decision(
                [
                  ...decided.outcome,
                  ...Array.map(gone, (plantId) =>
                    RecordOutcome.Skipped({
                      plantId,
                      reason: Refusal.PlantGone({ plantId }),
                    })
                  ),
                ],
                decided.writes,
                decided.events
              )
            )
          },
          apply: store.apply,
        })
      }).pipe(Effect.provide(context))

    const envOf = (
      permit: PlantPermit<'care'>,
      careTypes: ReadonlyArray<CareType>
    ) =>
      Effect.gen(function* () {
        const wateringDays = Array.contains(careTypes, 'watering')
          ? yield* advisor.wateringDays([permit.plantId])
          : new Map<string, number>()
        const now = yield* DateTime.now
        return (): DecideEnv => ({
          now,
          newCareLogId: crypto.randomUUID(),
          wateringDays: Option.fromNullishOr(wateringDays.get(permit.plantId)),
          by: Option.fromNullishOr(actingUserId(permit)),
        })
      })

    const onPlant = <R extends Refusal>(
      name: string,
      permit: PlantPermit<PlantAction>,
      careTypes: ReadonlyArray<CareType>,
      gone: R,
      decide: (plant: CarePlant) => Result.Result<Decision<void>, R>
    ) =>
      runCommand({
        name,
        topic: CareTopic,
        load: store.lockAndLoad([permit.plantId], careTypes),
        decide: (plants) =>
          pipe(
            Option.fromNullishOr(plants.get(permit.plantId)),
            Result.fromOption(() => gone),
            Result.flatMap(decide)
          ),
        apply: store.apply,
      }).pipe(Effect.provide(context))

    const careTypeOf = (permit: PlantPermit<'care'>, careLogId: string) =>
      store.careLogKey(careLogId).pipe(
        Effect.catchTag('SqlError', Effect.die),
        Effect.map(Option.filter((key) => key.plantId === permit.plantId)),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(Refusal.CareNotFound({ careLogId })),
            onSome: (key) => Effect.succeed(key.careType),
          })
        )
      )

    const amend: Care['Service']['amend'] = ({ permit, careLogId, ...input }) =>
      Effect.gen(function* () {
        const careType = yield* careTypeOf(permit, careLogId)
        const env = yield* envOf(
          permit,
          Option.isSome(input.on) ? [careType] : []
        )
        yield* onPlant<AmendRefusal>(
          'care.amend',
          permit,
          [careType],
          Refusal.CareNotFound({ careLogId }),
          (plant) => amendCare(plant, careLogId, careType, input, env())
        )
      }).pipe(Effect.mapError(asError))

    const remove: Care['Service']['remove'] = ({ permit, careLogId }) =>
      Effect.gen(function* () {
        const careType = yield* careTypeOf(permit, careLogId)
        const env = yield* envOf(permit, [])
        yield* onPlant<RemoveRefusal>(
          'care.remove',
          permit,
          [careType],
          Refusal.CareNotFound({ careLogId }),
          (plant) => removeCare(plant, careLogId, careType, env())
        )
      }).pipe(Effect.mapError(asError))

    const correct: Care['Service']['correctLastCare'] = ({
      permit,
      corrections,
    }) =>
      Effect.gen(function* () {
        if (Array.isReadonlyArrayEmpty(corrections)) return
        const careTypes = Array.map(corrections, (c) => c.careType)
        const env = yield* envOf(permit, careTypes)
        yield* onPlant<SkipReason>(
          'care.correctLastCare',
          permit,
          careTypes,
          Refusal.PlantGone({ plantId: permit.plantId }),
          (plant) =>
            mergeDecisions(
              Array.map(
                corrections,
                ({
                  careType,
                  on,
                }): Result.Result<Decision<void>, RecordRefusal> =>
                  correctLastCare(plant, careType, on, env())
              )
            )
        )
      }).pipe(Effect.mapError(asError))

    const setSchedules: Care['Service']['setSchedules'] = ({
      permit,
      frequencies,
    }) =>
      Array.isReadonlyArrayEmpty(frequencies)
        ? Effect.void
        : onPlant<Extract<SkipReason, { _tag: 'Dead' | 'PlantGone' }>>(
            'care.setSchedules',
            permit,
            Array.map(frequencies, ([careType]) => careType),
            Refusal.PlantGone({ plantId: permit.plantId }),
            (plant) =>
              mergeDecisions(
                Array.map(frequencies, ([careType, frequency]) =>
                  setSchedule(plant, careType, frequency)
                )
              )
          ).pipe(Effect.mapError(asError))

    const moveDueDays: Care['Service']['moveDueDays'] = ({ reason, moves }) =>
      Array.isReadonlyArrayEmpty(moves)
        ? Effect.void
        : runCommand({
            name: 'care.moveDueDays',
            topic: CareTopic,
            load: store.lockAndLoad(
              Array.sort(
                Array.dedupe(Array.map(moves, (m) => m.plantId)),
                Order.String
              ),
              Array.dedupe(Array.map(moves, (m) => m.careType))
            ),
            decide: (plants) =>
              mergeDecisions(
                Array.map(moves, ({ plantId, careType, move }) =>
                  Result.succeed(
                    pipe(
                      Option.fromNullishOr(plants.get(plantId)),
                      Option.match({
                        onNone: (): Decision<void> => decision(undefined),
                        onSome: (plant) =>
                          moveDueDay(plant, careType, move, reason),
                      })
                    )
                  )
                )
              ),
            apply: store.apply,
          }).pipe(Effect.provide(context))

    return Care.of({
      record,
      recordOne: ({ permit, ...command }) =>
        Effect.flatMap(record({ ...command, permits: [permit] }), (outcomes) =>
          oneOutcome(permit, outcomes)
        ),
      amend,
      remove,
      correctLastCare: correct,
      setSchedules,
      moveDueDays,
    })
  })
)
