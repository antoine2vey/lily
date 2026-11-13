import { createMockSqlClient } from '@lily/api/__tests__/mocks/sql-client'
import {
  Care,
  type CareEvent,
  type RecordCare,
  RecordOutcome,
  Refusal,
} from '@lily/api/contexts/care'
import { CareLive, oneOutcome } from '@lily/api/contexts/care/care'
import type {
  CareEntry,
  CareLine,
  CarePlant,
} from '@lily/api/contexts/care/domain/care-plant'
import { CareWrite } from '@lily/api/contexts/care/domain/decide'
import { CareStore } from '@lily/api/contexts/care/store'
import { WeatherAdvisor } from '@lily/api/contexts/care/weather'
import { Outbox } from '@lily/api/kernel/outbox'
import { Actor, mintPermit, type PlantPermit } from '@lily/api/kernel/permit'
import type { CareType } from '@lily/shared'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export const carePermit = (
  plantId: string,
  userId = 'user-1'
): PlantPermit<'care'> => mintPermit(plantId, 'care', Actor.User({ userId }))

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

export const createInMemoryCare = (
  initial: ReadonlyArray<CarePlant>,
  options: { readonly wateringDays?: Readonly<Record<string, number>> } = {}
) => {
  const plants = new Map(Array.map(initial, (plant) => [plant.id, plant]))
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
      everyPlant((plant) => ({
        ...plant,
        openPlanSteps: Array.filter(
          plant.openPlanSteps,
          (step) => step.id !== w.stepId
        ),
      })),
    SettlePlan: () => undefined,
  })

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
      lockAndLoad: (plantIds) =>
        Effect.sync(
          () =>
            new Map(
              Array.flatMap(plantIds, (id) =>
                pipe(
                  Option.fromNullishOr(plants.get(id)),
                  Option.match({
                    onNone: () => [],
                    onSome: (plant) => [[id, plant] as const],
                  })
                )
              )
            )
        ),
      weatherProfiles: () => Effect.succeed([]),
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
    })
  )

  return {
    plants,
    events,
    writes,
    layer: CareLive.pipe(
      Layer.provide(
        Layer.mergeAll(store, advisor, outbox, createMockSqlClient())
      )
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
