import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import {
  type CarePlanRows,
  createCarePlanRows,
} from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockSqlClient } from '@lily/api/__tests__/mocks/sql-client'
import {
  Care,
  type CareEvent,
  type RecordCare,
  RecordOutcome,
  Refusal,
} from '@lily/api/contexts/care'
import { CareLive, oneOutcome } from '@lily/api/contexts/care/care'
import { CarePlansLive } from '@lily/api/contexts/care/care-plans'
import {
  type CareEntry,
  type CareLine,
  type CarePlant,
  LifeState,
} from '@lily/api/contexts/care/domain/care-plant'
import { CareWrite } from '@lily/api/contexts/care/domain/decide'
import type { Plan } from '@lily/api/contexts/care/domain/plan'
import { PlantLifeLive } from '@lily/api/contexts/care/plant-life'
import { CareStore } from '@lily/api/contexts/care/store'
import { WeatherAdvisor } from '@lily/api/contexts/care/weather'
import { eventBusForwarder } from '@lily/api/events/care-forwarder'
import { Outbox } from '@lily/api/kernel/outbox'
import { mintOwnerHeld, type OwnerHeld } from '@lily/api/kernel/owner'
import {
  Actor,
  mintPermit,
  type PlantAction,
  type PlantPermit,
} from '@lily/api/kernel/permit'
import {
  ownerColumns,
  withOwner,
} from '@lily/api/repositories/helpers/plant-owner'
import type { plants as plantsTable } from '@lily/db/schema'
import { CareDays, type CareType, type PlantOwner } from '@lily/shared'
import type { AppEvent, EventBus } from '@lily/shared/server'
import { Array, DateTime, Effect, Layer, Option, pipe } from 'effect'

type PlantRow = typeof plantsTable.$inferSelect

export const carePermit = (
  plantId: string,
  userId = 'user-1'
): PlantPermit<'care'> => mintPermit(plantId, 'care', Actor.User({ userId }))

export const chatPermit = (
  plantId: string,
  userId = 'user-1'
): PlantPermit<'chat'> => mintPermit(plantId, 'chat', Actor.User({ userId }))

export const permitTo = <A extends PlantAction>(
  action: A,
  plantId: string,
  userId = 'user-1'
): PlantPermit<A> => mintPermit(plantId, action, Actor.User({ userId }))

export const toldToTheApp = async (
  events: ReadonlyArray<CareEvent>
): Promise<ReadonlyArray<AppEvent>> => {
  const publishedEvents: AppEvent[] = []
  await Effect.runPromise(
    Effect.flatMap(Effect.context<EventBus>(), (context) =>
      Effect.forEach(events, eventBusForwarder(context).handle, {
        discard: true,
      })
    ).pipe(Effect.provide(createMockEventBus({ publishedEvents })))
  )
  return publishedEvents
}

export const ownerHeld = (owner: PlantOwner): OwnerHeld => mintOwnerHeld(owner)

const latestFirst = (history: ReadonlyArray<CareEntry>) =>
  [...history].sort((a, b) => (a.day < b.day ? 1 : -1))

const withLine = (
  plant: CarePlant,
  careType: CareType,
  change: (line: CareLine) => CareLine
): CarePlant => ({
  ...plant,
  lines: new Map([
    ...plant.lines,
    [
      careType,
      change(
        plant.lines.get(careType) ?? {
          careType,
          schedule: Option.none(),
          history: [],
        }
      ),
    ],
  ]),
})

const mapLines = (
  plant: CarePlant,
  change: (line: CareLine) => CareLine
): CarePlant => ({
  ...plant,
  lines: new Map(
    Array.map([...plant.lines], ([careType, line]) => [careType, change(line)])
  ),
})

const seedPlanRows = (rows: CarePlanRows, plant: CarePlant) =>
  Array.forEach(plant.plans, (plan) => {
    rows.plans.push(
      createTestCarePlan({
        id: plan.id,
        plantId: plant.id,
        status: plan.status,
        createdAt: DateTime.toDateUtc(plan.createdAt),
      })
    )
    Array.forEach(plan.steps, (step) => {
      rows.steps.push(
        createTestCarePlanStep(plan.id, {
          id: step.id,
          position: step.position,
          careType: Option.getOrNull(step.careType),
          dueDate: Option.getOrNull(Option.map(step.dueAt, DateTime.toDateUtc)),
          completedAt: step.done ? new Date(0) : null,
        })
      )
    })
  })

const plansOf = (rows: CarePlanRows, plantId: string): ReadonlyArray<Plan> =>
  Array.map(
    Array.filter(rows.plans, (plan) => plan.plantId === plantId),
    (plan): Plan => ({
      id: plan.id,
      status: plan.status,
      createdAt: DateTime.makeUnsafe(plan.createdAt),
      steps: Array.map(
        Array.filter(rows.steps, (step) => step.planId === plan.id),
        (step) => ({
          id: step.id,
          position: step.position,
          careType: Option.fromNullishOr(step.careType),
          dueAt: Option.map(
            Option.fromNullishOr(step.dueDate),
            DateTime.makeUnsafe
          ),
          done: step.completedAt !== null,
        })
      ),
    })
  )

const ownerIdOf = (owner: PlantOwner): string =>
  owner._tag === 'User' ? owner.userId : owner.canopyId

export const createInMemoryCare = (
  initial: ReadonlyArray<CarePlant>,
  options: {
    readonly wateringDays?: Readonly<Record<string, number>>
    readonly plans?: CarePlanRows
    readonly plantRows?: PlantRow[]
    readonly timezones?: Readonly<Record<string, string>>
    readonly goneAccounts?: ReadonlyArray<string>
  } = {}
) => {
  const plantRows = options.plantRows ?? []
  const timezoneOf = (owner: PlantOwner) =>
    options.timezones?.[ownerIdOf(owner)] ?? 'UTC'
  const carePlantOf = (
    id: string,
    owner: PlantOwner,
    life: LifeState
  ): CarePlant => ({
    id,
    owner,
    life,
    timezone: timezoneOf(owner),
    today: CareDays.today(timezoneOf(owner), DateTime.nowUnsafe()),
    needsAttention: false,
    lines: new Map(),
    plans: [],
  })
  const plants = new Map([
    ...Array.map(plantRows, (row) => {
      const { owner } = withOwner(row)
      return [
        row.id,
        carePlantOf(
          row.id,
          owner,
          row.diedAt === null ? LifeState.Living() : LifeState.Dead()
        ),
      ] as const
    }),
    ...Array.map(initial, (plant) => [plant.id, plant] as const),
  ])
  const planRows = options.plans ?? createCarePlanRows()
  Array.forEach(initial, (plant) => seedPlanRows(planRows, plant))
  const changeStep = (
    stepId: string,
    change: (
      step: CarePlanRows['steps'][number]
    ) => CarePlanRows['steps'][number]
  ) =>
    Array.forEach(planRows.steps, (step, index) => {
      if (step.id === stepId) planRows.steps[index] = change(step)
    })
  const changePlan = (
    planId: string,
    change: (
      plan: CarePlanRows['plans'][number]
    ) => CarePlanRows['plans'][number]
  ) =>
    Array.forEach(planRows.plans, (plan, index) => {
      if (plan.id === planId) planRows.plans[index] = change(plan)
    })
  const changeRow = (plantId: string, change: (row: PlantRow) => PlantRow) =>
    Array.forEach(plantRows, (row, index) => {
      if (row.id === plantId) plantRows[index] = change(row)
    })
  const removeWhere = <A>(rows: A[], gone: (row: A) => boolean) =>
    rows.splice(0, rows.length, ...Array.filter(rows, (row) => !gone(row)))
  const events: CareEvent[] = []
  const writes: CareWrite[] = []

  const update = (plantId: string, change: (plant: CarePlant) => CarePlant) =>
    pipe(
      Option.fromNullishOr(plants.get(plantId)),
      Option.map((plant) => plants.set(plantId, change(plant)))
    )
  const everyPlant = (change: (plant: CarePlant) => CarePlant) =>
    Array.forEach([...plants.keys()], (id) => update(id, change))

  const applyOne = CareWrite.$match({
    InsertCare: (w) =>
      update(w.plantId, (plant) =>
        withLine(plant, w.careType, (line) => ({
          ...line,
          history: latestFirst([...line.history, { id: w.id, day: w.day }]),
        }))
      ),
    ReplaceCare: (w) =>
      everyPlant((plant) =>
        mapLines(plant, (line) => ({
          ...line,
          history: latestFirst(
            Array.map(line.history, (entry) =>
              entry.id === w.id
                ? {
                    ...entry,
                    day: pipe(
                      w.when,
                      Option.map((when) => when.day),
                      Option.getOrElse(() => entry.day)
                    ),
                  }
                : entry
            )
          ),
        }))
      ),
    DeleteCare: (w) =>
      everyPlant((plant) =>
        mapLines(plant, (line) => ({
          ...line,
          history: Array.filter(line.history, (entry) => entry.id !== w.id),
        }))
      ),
    PutSchedule: (w) =>
      update(w.plantId, (plant) =>
        withLine(plant, w.careType, (line) => ({
          ...line,
          schedule: Option.some(w.schedule),
        }))
      ),
    DropSchedule: (w) =>
      update(w.plantId, (plant) =>
        withLine(plant, w.careType, (line) => ({
          ...line,
          schedule: Option.none(),
        }))
      ),
    CompletePlanStep: (w) =>
      changeStep(w.stepId, (step) => ({
        ...step,
        completedAt: DateTime.toDateUtc(w.at),
        careLogId: Option.getOrNull(w.careLogId),
      })),
    ReopenPlanStep: (w) =>
      changeStep(w.stepId, (step) => ({
        ...step,
        completedAt: null,
        careLogId: null,
      })),
    DeletePlanStep: (w) =>
      removeWhere(planRows.steps, (step) => step.id === w.stepId),
    SetPlanStatus: (w) => {
      const at = DateTime.toDateUtc(w.at)
      changePlan(w.planId, (plan) => ({
        ...plan,
        status: w.to,
        acceptedAt:
          w.to === 'accepted' && w.from !== 'completed' ? at : plan.acceptedAt,
        completedAt:
          w.to === 'completed'
            ? at
            : w.to === 'accepted'
              ? null
              : plan.completedAt,
      }))
    },
    DeletePlan: (w) => {
      removeWhere(planRows.plans, (plan) => plan.id === w.planId)
      removeWhere(planRows.steps, (step) => step.planId === w.planId)
    },
    InsertPlan: (w) => {
      planRows.plans.push(
        createTestCarePlan({
          id: w.planId,
          plantId: w.plantId,
          userId: w.authorId,
          title: w.title,
          source: w.source,
          status: 'proposed',
          createdAt: new Date(),
        })
      )
      Array.forEach(w.steps, (step, position) => {
        planRows.steps.push(
          createTestCarePlanStep(w.planId, {
            position,
            title: step.title,
            description: Option.getOrNull(step.description),
            careType: Option.getOrNull(step.careType),
            dueDate: Option.getOrNull(
              Option.map(step.dueAt, DateTime.toDateUtc)
            ),
          })
        )
      })
    },
    LinkPlanToDiagnosis: (w) =>
      changePlan(w.planId, (plan) => ({ ...plan, diagnosisId: w.diagnosisId })),
    InsertPlant: (w) => {
      plants.set(w.plantId, carePlantOf(w.plantId, w.owner, LifeState.Living()))
      plantRows.push({
        id: w.plantId,
        ...ownerColumns(w.owner),
        createdByUserId: w.createdBy,
        name: w.draft.name,
        description: Option.getOrNull(w.draft.description),
        category: Option.getOrNull(w.draft.category),
        imageUrl: Option.getOrNull(w.draft.imageUrl),
        humidityRating: w.draft.humidityRating,
        lightingRating: w.draft.lightingRating,
        petToxicityRating: w.draft.petToxicityRating,
        wateringRating: w.draft.wateringRating,
        potWidthCm: Option.getOrNull(w.draft.potWidthCm),
        potHeightCm: Option.getOrNull(w.draft.potHeightCm),
        roomId: Option.getOrNull(w.draft.roomId),
        health: 'HEALTHY',
        remindersEnabled: true,
        isFavorite: false,
        dateAdded: new Date(),
        updatedAt: new Date(),
        diedAt: null,
        deathCause: null,
        deathNote: null,
      })
    },
    BuryPlant: (w) => {
      update(w.plantId, (plant) => ({ ...plant, life: LifeState.Dead() }))
      changeRow(w.plantId, (row) => ({
        ...row,
        diedAt: DateTime.toDateUtc(w.at),
        deathCause: w.cause,
        deathNote: Option.getOrNull(w.note),
      }))
    },
    RevivePlant: (w) => {
      update(w.plantId, (plant) => ({ ...plant, life: LifeState.Living() }))
      changeRow(w.plantId, (row) => ({
        ...row,
        diedAt: null,
        deathCause: null,
        deathNote: null,
      }))
    },
    DeletePlant: (w) => {
      plants.delete(w.plantId)
      removeWhere(plantRows, (row) => row.id === w.plantId)
    },
  })

  const lockAndLoad: CareStore['Service']['lockAndLoad'] = (
    plantIds,
    careTypes
  ) =>
    Effect.sync(
      () =>
        new Map(
          Array.flatMap(plantIds, (id) =>
            pipe(
              Option.fromNullishOr(plants.get(id)),
              Option.match({
                onNone: () => [],
                onSome: (plant) => [
                  [
                    id,
                    {
                      ...plant,
                      lines: new Map(
                        Array.filter([...plant.lines], ([careType]) =>
                          Array.contains(careTypes, careType)
                        )
                      ),
                      plans: plansOf(planRows, id),
                    },
                  ] as const,
                ],
              })
            )
          )
        )
    )

  const store = Layer.succeed(
    CareStore,
    CareStore.of({
      careLogKey: (careLogId) =>
        Effect.sync(() =>
          Array.findFirst(
            Array.flatMap([...plants.values()], (plant) =>
              Array.flatMap([...plant.lines.values()], (line) =>
                Array.map(line.history, (entry) => ({
                  id: entry.id,
                  plantId: plant.id,
                  careType: line.careType,
                }))
              )
            ),
            (key) => key.id === careLogId
          )
        ),
      careTypesOfPlan: (planId) =>
        Effect.sync(() =>
          Array.dedupe(
            Array.flatMap(planRows.steps, (step) =>
              step.planId === planId
                ? Option.toArray(Option.fromNullishOr(step.careType))
                : []
            )
          )
        ),
      lockAndLoadForPlanting: (userIds, owner) =>
        Effect.succeed({
          timezone: timezoneOf(owner),
          accountsHeld: new Set(
            Array.difference(userIds, options.goneAccounts ?? [])
          ),
        }),
      lockAndLoad,
      lockAndLoadFor: (actorIds, plantIds, careTypes) =>
        Effect.map(lockAndLoad(plantIds, careTypes), (loaded) => ({
          plants: loaded,
          accountsHeld: new Set(
            Array.difference(actorIds, options.goneAccounts ?? [])
          ),
        })),
      weatherProfiles: () => Effect.succeed([]),
      linkPlanToMessage: (planId, chatMessageId) =>
        Effect.sync(() =>
          changePlan(planId, (plan) => ({ ...plan, chatMessageId }))
        ),
      apply: (applied) =>
        Effect.sync(() => {
          Array.forEach(applied, (write) => {
            writes.push(write)
            applyOne(write)
          })
        }),
    })
  )
  const advisor = Layer.succeed(
    WeatherAdvisor,
    WeatherAdvisor.of({
      wateringDays: (plantIds) =>
        Effect.succeed(
          new Map(
            Array.flatMap(plantIds, (id) =>
              pipe(
                Option.fromNullishOr(options.wateringDays?.[id]),
                Option.match({
                  onNone: () => [],
                  onSome: (days) => [[id, days] as const],
                })
              )
            )
          )
        ),
    })
  )
  const outbox = Layer.succeed(
    Outbox,
    Outbox.of({
      append: (_to, appended) =>
        Effect.sync(() => {
          events.push(...(appended as ReadonlyArray<CareEvent>))
        }),
      wake: Effect.void,
      drain: Effect.succeed(0),
      redrive: () => Effect.succeed(0),
    })
  )

  return {
    plants,
    events,
    writes,
    carePlanRepository: planRows.layer,
    layer: Layer.mergeAll(CareLive, CarePlansLive, PlantLifeLive).pipe(
      Layer.provide(Layer.mergeAll(store, advisor)),
      Layer.provideMerge(Layer.mergeAll(outbox, createMockSqlClient()))
    ),
  }
}

type RecordCommand = RecordCare & {
  readonly permits: ReadonlyArray<PlantPermit<'care'>>
}

type CareCommands = {
  readonly [K in
    | 'amend'
    | 'remove'
    | 'correctLastCare'
    | 'setSchedules'
    | 'moveDueDays']: Parameters<Care['Service'][K]>[0]
}

export const createStubCare = (
  outcomeOf: (plantId: string, command: RecordCommand) => RecordOutcome = (
    plantId
  ) =>
    RecordOutcome.Skipped({ plantId, reason: Refusal.PlantGone({ plantId }) })
) => {
  const commands: RecordCommand[] = []
  const amended: CareCommands['amend'][] = []
  const removed: CareCommands['remove'][] = []
  const corrected: CareCommands['correctLastCare'][] = []
  const scheduled: CareCommands['setSchedules'][] = []
  const moved: CareCommands['moveDueDays'][] = []
  const record = (command: RecordCommand) =>
    Effect.sync(() => {
      commands.push(command)
      return Array.map(command.permits, (permit) =>
        outcomeOf(permit.plantId, command)
      )
    })
  const layer = Layer.succeed(
    Care,
    Care.of({
      record,
      recordOne: ({ permit, ...command }) =>
        Effect.flatMap(record({ ...command, permits: [permit] }), (outcomes) =>
          oneOutcome(permit, outcomes)
        ),
      setSchedules: (command) =>
        Effect.sync(() => void scheduled.push(command)),
      moveDueDays: (command) => Effect.sync(() => void moved.push(command)),
      amend: (command) => Effect.sync(() => void amended.push(command)),
      remove: (command) => Effect.sync(() => void removed.push(command)),
      correctLastCare: (command) =>
        Effect.sync(() => void corrected.push(command)),
    })
  )
  return { commands, amended, removed, corrected, scheduled, moved, layer }
}
