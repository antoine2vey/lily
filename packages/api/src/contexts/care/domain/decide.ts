import {
  type CareEntry,
  type CareLine,
  type CarePlant,
  CareWhen,
  type DecideEnv,
  type Frequency,
  lineOf,
  PlanStepChoice,
  type PlantDraft,
  type Schedule,
} from '@lily/api/contexts/care/domain/care-plant'
import type {
  CareEvent,
  ScheduleChangeReason,
} from '@lily/api/contexts/care/domain/events'
import {
  earliestOpenStepOfAcceptedPlans,
  openStepNamed,
  type Plan,
  type PlanStatus,
  type ProposedStep,
  type SettledStatus,
  type StepOfPlan,
  statusToSettleInto,
  withStepDone,
} from '@lily/api/contexts/care/domain/plan'
import { Actor } from '@lily/api/kernel/permit'
import {
  decision,
  type Decision as KernelDecision,
} from '@lily/api/kernel/transact'
import {
  type CareDay,
  CareDays,
  type CareType,
  type LimitExceededError,
  type PlantOwner,
} from '@lily/shared'
import type { CarePlanSource } from '@lily/shared/care-plan'
import type { PlantDeathCause } from '@lily/shared/plant'
import { Array, Data, DateTime, Option, Order, pipe, Result } from 'effect'

export type CareWrite = Data.TaggedEnum<{
  InsertCare: {
    readonly id: string
    readonly plantId: string
    readonly careType: CareType
    readonly day: CareDay
    readonly at: DateTime.Utc
    readonly by: Option.Option<string>
    readonly notes: Option.Option<string>
    readonly photoUrl: Option.Option<string>
  }
  ReplaceCare: {
    readonly id: string
    readonly when: Option.Option<{
      readonly day: CareDay
      readonly at: DateTime.Utc
    }>
    readonly notes: Option.Option<Option.Option<string>>
    readonly photoUrl: Option.Option<Option.Option<string>>
  }
  DeleteCare: { readonly id: string }
  PutSchedule: {
    readonly plantId: string
    readonly careType: CareType
    readonly schedule: Schedule
    readonly timezone: string
  }
  DropSchedule: { readonly plantId: string; readonly careType: CareType }
  CompletePlanStep: {
    readonly stepId: string
    readonly careLogId: Option.Option<string>
    readonly at: DateTime.Utc
  }
  ReopenPlanStep: { readonly stepId: string }
  DeletePlanStep: { readonly stepId: string }
  SetPlanStatus: {
    readonly planId: string
    readonly from: PlanStatus
    readonly to: Exclude<PlanStatus, 'proposed'>
    readonly at: DateTime.Utc
  }
  DeletePlan: { readonly planId: string }
  InsertPlan: {
    readonly planId: string
    readonly plantId: string
    readonly authorId: string
    readonly title: string
    readonly source: CarePlanSource
    readonly steps: ReadonlyArray<ProposedStep>
  }
  LinkPlanToDiagnosis: {
    readonly planId: string
    readonly diagnosisId: string
  }
  InsertPlant: {
    readonly plantId: string
    readonly owner: PlantOwner
    readonly createdBy: string
    readonly draft: PlantDraft
  }
  BuryPlant: {
    readonly plantId: string
    readonly at: DateTime.Utc
    readonly cause: PlantDeathCause
    readonly note: Option.Option<string>
  }
  RevivePlant: { readonly plantId: string }
  DeletePlant: { readonly plantId: string }
}>
export const CareWrite = Data.taggedEnum<CareWrite>()

export type Decision<A> = KernelDecision<CareWrite, CareEvent, A>

export type Refusal = Data.TaggedEnum<{
  AlreadyCared: {
    readonly plantId: string
    readonly careType: CareType
    readonly day: CareDay
  }
  FutureDay: {
    readonly plantId: string
    readonly day: CareDay
    readonly today: CareDay
  }
  Dead: { readonly plantId: string }
  PlantGone: { readonly plantId: string }
  CareNotFound: { readonly careLogId: string }
  PlanGone: { readonly planId: string }
  PlanOfDeadPlant: { readonly planId: string }
  StepGone: { readonly planId: string; readonly stepId: string }
  PlanNotProposed: { readonly planId: string; readonly status: PlanStatus }
  ProposalForDeadPlant: { readonly plantId: string }
  AlreadyDead: { readonly plantId: string }
  NotDead: { readonly plantId: string }
  OwnerFull: { readonly error: LimitExceededError }
  ActorGone: { readonly plantId: string; readonly userId: string }
  CreatorGone: { readonly userId: string }
}>
export const Refusal = Data.taggedEnum<Refusal>()

export type RefusalOf<T extends Refusal['_tag']> = Extract<
  Refusal,
  { readonly _tag: T }
>
export type RecordRefusal = RefusalOf<'AlreadyCared' | 'FutureDay' | 'Dead'>
export type SkipReason = RecordRefusal | RefusalOf<'PlantGone'>
export type AmendRefusal = RefusalOf<
  'CareNotFound' | 'AlreadyCared' | 'FutureDay'
>
export type RemoveRefusal = RefusalOf<'CareNotFound'>

export interface Recorded {
  readonly plantId: string
  readonly careLogId: string
  readonly careType: CareType
  readonly day: CareDay
  readonly dueDay: Option.Option<CareDay>
}

export type RecordOutcome = Data.TaggedEnum<{
  Recorded: Recorded
  Skipped: { readonly plantId: string; readonly reason: SkipReason }
}>
export const RecordOutcome = Data.taggedEnum<RecordOutcome>()

const latestFirst = Order.flip(
  Order.mapInput(Order.String, (entry: CareEntry) => entry.day)
)

const latestDay = (line: CareLine): Option.Option<CareDay> =>
  Option.map(Array.head(line.history), (entry) => entry.day)

const sameDay = Option.makeEquivalence<CareDay>((a, b) => a === b)

export const nextDueDay = (
  line: CareLine,
  today: CareDay,
  wateringDays: Option.Option<number>
): Option.Option<CareDay> =>
  Option.map(line.schedule, (schedule) =>
    Option.match(Array.head(line.history), {
      onNone: () => schedule.startedOn,
      onSome: (latest) =>
        CareDays.addDays(
          latest.day,
          Math.max(
            1,
            line.careType === 'watering' && latest.day === today
              ? Option.getOrElse(wateringDays, () => schedule.frequency)
              : schedule.frequency
          )
        ),
    })
  )

interface Recomputed {
  readonly dueDay: Option.Option<CareDay>
  readonly writes: ReadonlyArray<CareWrite>
  readonly events: ReadonlyArray<CareEvent>
}

const unchanged = (line: CareLine): Recomputed => ({
  dueDay: Option.map(line.schedule, (schedule) => schedule.dueDay),
  writes: [],
  events: [],
})

export const recompute = (
  plant: CarePlant,
  line: CareLine,
  latestBefore: Option.Option<CareDay>,
  wateringDays: Option.Option<number>
): Recomputed => {
  const latestCareChanged = !sameDay(latestBefore, latestDay(line))
  return pipe(
    line.schedule,
    Option.filter(() => plant.life._tag === 'Living' && latestCareChanged),
    Option.match({
      onNone: () => unchanged(line),
      onSome: (schedule) => {
        const dueDay = pipe(
          nextDueDay(line, plant.today, wateringDays),
          Option.getOrElse(() => schedule.dueDay)
        )
        return {
          dueDay: Option.some(dueDay),
          writes: [
            CareWrite.PutSchedule({
              plantId: plant.id,
              careType: line.careType,
              schedule: { ...schedule, dueDay },
              timezone: plant.timezone,
            }),
          ],
          events:
            dueDay === schedule.dueDay
              ? []
              : [
                  {
                    _tag: 'ScheduleChanged',
                    plantId: plant.id,
                    careType: line.careType,
                    dueDay,
                    reason: 'care',
                  },
                ],
        }
      },
    })
  )
}

export type AccountsHeld = ReadonlySet<string>

export const requireActor = (
  held: AccountsHeld,
  userId: string,
  plantId: string
): Result.Result<string, RefusalOf<'ActorGone'>> =>
  held.has(userId)
    ? Result.succeed(userId)
    : Result.fail(Refusal.ActorGone({ plantId, userId }))

export const authorOf = (
  held: AccountsHeld,
  actor: Actor,
  plantId: string
): Result.Result<Option.Option<string>, RefusalOf<'ActorGone'>> =>
  Actor.$match(actor, {
    System: () => Result.succeed(Option.none()),
    User: ({ userId }) =>
      Result.map(requireActor(held, userId, plantId), Option.some),
  })

const requireLiving = (
  plant: CarePlant
): Result.Result<CarePlant, RefusalOf<'Dead'>> =>
  plant.life._tag === 'Living'
    ? Result.succeed(plant)
    : Result.fail(Refusal.Dead({ plantId: plant.id }))

interface ResolvedDay {
  readonly day: CareDay
  readonly at: DateTime.Utc
}

export const resolveDay = (
  plant: CarePlant,
  when: CareWhen,
  now: DateTime.Utc
): Result.Result<ResolvedDay, RefusalOf<'FutureDay'>> => {
  const resolved = CareWhen.$match(when, {
    Today: (): ResolvedDay => ({ day: plant.today, at: now }),
    Day: ({ day }): ResolvedDay => ({
      day,
      at: day === plant.today ? now : CareDays.startOf(day, plant.timezone),
    }),
    At: ({ instant }): ResolvedDay => ({
      day: CareDays.of(instant, plant.timezone),
      at: instant,
    }),
  })
  return CareDays.isBefore(plant.today, resolved.day)
    ? Result.fail(
        Refusal.FutureDay({
          plantId: plant.id,
          day: resolved.day,
          today: plant.today,
        })
      )
    : Result.succeed(resolved)
}

const refuseIfCaredOn = (
  plant: CarePlant,
  line: CareLine,
  day: CareDay,
  except: Option.Option<string> = Option.none()
): Result.Result<CareDay, RefusalOf<'AlreadyCared'>> =>
  Array.some(
    line.history,
    (entry) => entry.day === day && !Option.contains(except, entry.id)
  )
    ? Result.fail(
        Refusal.AlreadyCared({
          plantId: plant.id,
          careType: line.careType,
          day,
        })
      )
    : Result.succeed(day)

const pickStep = (
  plans: ReadonlyArray<Plan>,
  careType: CareType,
  choice: PlanStepChoice
): Option.Option<StepOfPlan> =>
  PlanStepChoice.$match(choice, {
    Auto: () => earliestOpenStepOfAcceptedPlans(plans, careType),
    Step: ({ id }) => openStepNamed(plans, id),
    None: () => Option.none(),
  })

export const settleWrites = (
  plan: Plan,
  at: DateTime.Utc
): ReadonlyArray<CareWrite> =>
  Option.match(statusToSettleInto(plan), {
    onNone: () => [],
    onSome: (to: SettledStatus) => [
      CareWrite.SetPlanStatus({ planId: plan.id, from: plan.status, to, at }),
    ],
  })

export const completeStep = (
  { plan, step }: StepOfPlan,
  careLogId: Option.Option<string>,
  at: DateTime.Utc
): ReadonlyArray<CareWrite> => [
  CareWrite.CompletePlanStep({ stepId: step.id, careLogId, at }),
  ...settleWrites(withStepDone(plan, step.id), at),
]

export interface RecordInput {
  readonly careType: CareType
  readonly on: CareWhen
  readonly notes: Option.Option<string>
  readonly photoUrl: Option.Option<string>
  readonly planStep: PlanStepChoice
}

export const recordCare = (
  plant: CarePlant,
  input: RecordInput,
  env: DecideEnv
): Result.Result<Decision<Recorded>, RecordRefusal> =>
  Result.gen(function* () {
    yield* requireLiving(plant)
    const { day, at } = yield* resolveDay(plant, input.on, env.now)
    const line = lineOf(plant, input.careType)
    yield* refuseIfCaredOn(plant, line, day)

    const after: CareLine = {
      ...line,
      history: Array.sort(
        Array.append(line.history, { id: env.newCareLogId, day }),
        latestFirst
      ),
    }
    const recomputed = recompute(
      plant,
      after,
      latestDay(line),
      env.wateringDays
    )
    const stepWrites = pipe(
      pickStep(plant.plans, input.careType, input.planStep),
      Option.match({
        onNone: () => [],
        onSome: (picked) =>
          completeStep(picked, Option.some(env.newCareLogId), at),
      })
    )

    return decision(
      {
        plantId: plant.id,
        careLogId: env.newCareLogId,
        careType: input.careType,
        day,
        dueDay: recomputed.dueDay,
      },
      [
        CareWrite.InsertCare({
          id: env.newCareLogId,
          plantId: plant.id,
          careType: input.careType,
          day,
          at,
          by: env.by,
          notes: input.notes,
          photoUrl: input.photoUrl,
        }),
        ...stepWrites,
        ...recomputed.writes,
      ],
      [
        {
          _tag: 'CareRecorded',
          plantId: plant.id,
          owner: plant.owner,
          careLogId: env.newCareLogId,
          careType: input.careType,
          day,
          by: Option.getOrNull(env.by),
          answeredAttention: plant.needsAttention,
        },
        ...recomputed.events,
      ]
    )
  })

export const recordCareOnAll = (
  plants: ReadonlyArray<readonly [CarePlant, DecideEnv]>,
  input: RecordInput
): Decision<ReadonlyArray<RecordOutcome>> => {
  const decided = Array.map(plants, ([plant, env]) =>
    Result.match(recordCare(plant, input, env), {
      onSuccess: (d): Decision<RecordOutcome> =>
        decision(RecordOutcome.Recorded(d.outcome), d.writes, d.events),
      onFailure: (reason): Decision<RecordOutcome> =>
        decision(RecordOutcome.Skipped({ plantId: plant.id, reason })),
    })
  )
  return decision(
    Array.map(decided, (d) => d.outcome),
    Array.flatMap(decided, (d) => d.writes),
    Array.flatMap(decided, (d) => d.events)
  )
}

export interface AmendInput {
  readonly on: Option.Option<CareWhen>
  readonly notes: Option.Option<Option.Option<string>>
  readonly photoUrl: Option.Option<Option.Option<string>>
}

const findCare = (
  line: CareLine,
  careLogId: string
): Result.Result<CareEntry, RefusalOf<'CareNotFound'>> =>
  Result.fromOption(
    Array.findFirst(line.history, (entry) => entry.id === careLogId),
    () => Refusal.CareNotFound({ careLogId })
  )

const amendEntry = (
  plant: CarePlant,
  line: CareLine,
  entry: CareEntry,
  input: AmendInput,
  env: DecideEnv
): Result.Result<Decision<void>, RefusalOf<'AlreadyCared' | 'FutureDay'>> =>
  Result.gen(function* () {
    const when = yield* Option.match(input.on, {
      onNone: () => Result.succeed(Option.none<ResolvedDay>()),
      onSome: (on) => Result.map(resolveDay(plant, on, env.now), Option.some),
    })
    const day = pipe(
      when,
      Option.map((resolved) => resolved.day),
      Option.getOrElse(() => entry.day)
    )
    if (day !== entry.day) {
      yield* refuseIfCaredOn(plant, line, day, Option.some(entry.id))
    }

    const after: CareLine = {
      ...line,
      history: Array.sort(
        Array.map(line.history, (e) => (e.id === entry.id ? { ...e, day } : e)),
        latestFirst
      ),
    }
    const recomputed = recompute(
      plant,
      after,
      latestDay(line),
      env.wateringDays
    )
    return decision(
      undefined,
      [
        CareWrite.ReplaceCare({
          id: entry.id,
          when,
          notes: input.notes,
          photoUrl: input.photoUrl,
        }),
        ...recomputed.writes,
      ],
      [
        {
          _tag: 'CareAmended',
          plantId: plant.id,
          careLogId: entry.id,
          careType: line.careType,
        },
        ...recomputed.events,
      ]
    )
  })

export const amendCare = (
  plant: CarePlant,
  careLogId: string,
  careType: CareType,
  input: AmendInput,
  env: DecideEnv
): Result.Result<Decision<void>, AmendRefusal> => {
  const line = lineOf(plant, careType)
  return Result.flatMap(findCare(line, careLogId), (entry) =>
    amendEntry(plant, line, entry, input, env)
  )
}

export const removeCare = (
  plant: CarePlant,
  careLogId: string,
  careType: CareType,
  env: DecideEnv
): Result.Result<Decision<void>, RemoveRefusal> =>
  Result.gen(function* () {
    const line = lineOf(plant, careType)
    yield* findCare(line, careLogId)
    const after: CareLine = {
      ...line,
      history: Array.filter(line.history, (entry) => entry.id !== careLogId),
    }
    const recomputed = recompute(
      plant,
      after,
      latestDay(line),
      env.wateringDays
    )
    return decision(
      undefined,
      [CareWrite.DeleteCare({ id: careLogId }), ...recomputed.writes],
      [
        { _tag: 'CareRemoved', plantId: plant.id, careLogId, careType },
        ...recomputed.events,
      ]
    )
  })

export const correctLastCare = (
  plant: CarePlant,
  careType: CareType,
  on: CareWhen,
  env: DecideEnv
): Result.Result<Decision<void>, RecordRefusal> =>
  Result.flatMap(requireLiving(plant), () => {
    const line = lineOf(plant, careType)
    return pipe(
      Array.head(line.history),
      Option.match({
        onNone: () =>
          Result.map(
            recordCare(
              plant,
              {
                careType,
                on,
                notes: Option.none(),
                photoUrl: Option.none(),
                planStep: PlanStepChoice.None(),
              },
              env
            ),
            (d) => decision(undefined, d.writes, d.events)
          ),
        onSome: (latest) =>
          amendEntry(
            plant,
            line,
            latest,
            {
              on: Option.some(on),
              notes: Option.none(),
              photoUrl: Option.none(),
            },
            env
          ),
      })
    )
  })

const merged = (decisions: ReadonlyArray<Decision<void>>): Decision<void> =>
  decision(
    undefined,
    Array.flatMap(decisions, (d) => d.writes),
    Array.flatMap(decisions, (d) => d.events)
  )

export const mergeDecisions = <R>(
  decisions: ReadonlyArray<Result.Result<Decision<void>, R>>
): Result.Result<Decision<void>, R> => Result.map(Result.all(decisions), merged)

export const putSchedule = (
  plant: CarePlant,
  careType: CareType,
  schedule: Schedule,
  reason: ScheduleChangeReason
): Decision<void> =>
  decision(
    undefined,
    [
      CareWrite.PutSchedule({
        plantId: plant.id,
        careType,
        schedule,
        timezone: plant.timezone,
      }),
    ],
    [
      {
        _tag: 'ScheduleChanged',
        plantId: plant.id,
        careType,
        dueDay: schedule.dueDay,
        reason,
      },
    ]
  )

const everyDays = (
  plant: CarePlant,
  line: CareLine,
  days: Frequency
): Decision<void> => {
  const startedOn = pipe(
    line.schedule,
    Option.map((schedule) => schedule.startedOn),
    Option.getOrElse(() => plant.today)
  )
  const draft: Schedule = { frequency: days, startedOn, dueDay: startedOn }
  const dueDay = pipe(
    nextDueDay(
      { ...line, schedule: Option.some(draft) },
      plant.today,
      Option.none()
    ),
    Option.getOrElse(() => startedOn)
  )
  return putSchedule(
    plant,
    line.careType,
    { ...draft, dueDay },
    Option.isSome(line.schedule) ? 'frequency' : 'created'
  )
}

export const setSchedule = (
  plant: CarePlant,
  careType: CareType,
  frequency: Option.Option<Frequency>
): Result.Result<Decision<void>, RefusalOf<'Dead'>> => {
  const line = lineOf(plant, careType)
  const kept = Option.match(frequency, {
    onNone: () => Option.isNone(line.schedule),
    onSome: (days) => Option.exists(line.schedule, (s) => s.frequency === days),
  })
  if (kept) return Result.succeed(decision(undefined))
  return Result.map(requireLiving(plant), () =>
    Option.match(frequency, {
      onNone: () =>
        decision(
          undefined,
          [CareWrite.DropSchedule({ plantId: plant.id, careType })],
          [
            {
              _tag: 'ScheduleChanged',
              plantId: plant.id,
              careType,
              dueDay: null,
              reason: 'dropped',
            },
          ]
        ),
      onSome: (days) => everyDays(plant, line, days),
    })
  )
}

export const startSchedules = (
  planted: CarePlant,
  frequencies: ReadonlyArray<readonly [CareType, Option.Option<Frequency>]>
): Decision<void> =>
  merged(
    Array.flatMap(frequencies, ([careType, frequency]) =>
      Option.toArray(
        Option.map(frequency, (days) =>
          everyDays(planted, lineOf(planted, careType), days)
        )
      )
    )
  )

export type DueMove = Data.TaggedEnum<{
  /** To the care day of an instant. */
  To: { readonly instant: DateTime.Utc }
  /** Earlier or later by whole days. */
  By: { readonly days: number }
  /**
   * After an absence: a line whose due day had begun when the absence ended
   * moves later by `days`, and never lands before the day after it ended. A
   * line due on the day of a return at midnight was not missed and stays.
   */
  AfterAbsence: { readonly endedAt: DateTime.Utc; readonly days: number }
}>
export const DueMove = Data.taggedEnum<DueMove>()

const movedDueDay = (plant: CarePlant, dueDay: CareDay, move: DueMove) =>
  DueMove.$match(move, {
    To: ({ instant }) => CareDays.of(instant, plant.timezone),
    By: ({ days }) => CareDays.addDays(dueDay, days),
    AfterAbsence: ({ endedAt, days }) => {
      const cameDue = DateTime.isLessThan(
        CareDays.startOf(dueDay, plant.timezone),
        endedAt
      )
      return cameDue
        ? CareDays.latest(
            CareDays.addDays(dueDay, days),
            CareDays.addDays(CareDays.of(endedAt, plant.timezone), 1)
          )
        : dueDay
    },
  })

export const moveDueDay = (
  plant: CarePlant,
  careType: CareType,
  move: DueMove,
  reason: ScheduleChangeReason
): Decision<void> =>
  pipe(
    lineOf(plant, careType).schedule,
    Option.filter(() => plant.life._tag === 'Living'),
    Option.flatMap((schedule) => {
      const dueDay = movedDueDay(plant, schedule.dueDay, move)
      return dueDay === schedule.dueDay
        ? Option.none()
        : Option.some({ ...schedule, dueDay })
    }),
    Option.match({
      onNone: () => decision(undefined),
      onSome: (moved) => putSchedule(plant, careType, moved, reason),
    })
  )
