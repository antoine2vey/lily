import {
  type CareTask,
  type CareTasksResponse,
  type CareType,
  startOfLocalDay,
} from '@lily/shared'
import {
  Array,
  DateTime,
  String as EffectString,
  Match,
  Option,
  Order,
  pipe,
  Record,
} from 'effect'
import type { TFunction } from 'i18next'
import {
  TODAY_WIDGET_MAX_ROWS,
  type TodayWidgetDay,
  type TodayWidgetDayStatus,
  type TodayWidgetRow,
  type TodayWidgetSnapshot,
} from '@/widgets/today/snapshot'

export interface TodayWidgetCopy {
  readonly title: string
  readonly needsCare: (plants: number) => string
  readonly needsCareCaption: (plants: number) => string
  readonly morePlants: (plants: number) => string
  readonly allDone: string
  readonly nextCareIn: (days: number) => string
  readonly nothingDue: string
  readonly careAction: (type: CareType) => string
  readonly daysLate: (days: number) => string
  readonly stale: string
  readonly signedOut: string
}

export const makeTodayWidgetCopy = (t: TFunction): TodayWidgetCopy => ({
  title: t('widget.title'),
  needsCare: (count) => t('widget.needsCare', { count }),
  needsCareCaption: (count) => t('widget.needsCareCaption', { count }),
  morePlants: (count) => t('widget.morePlants', { count }),
  allDone: t('widget.allDone'),
  nextCareIn: (count) => t('widget.nextCareIn', { count }),
  nothingDue: t('widget.nothingDue'),
  careAction: (type) => t(`types.${type}.action`),
  daysLate: (count) => t('widget.daysLate', { count }),
  stale: t('widget.stale'),
  signedOut: t('widget.signedOut'),
})

export type TodayWidgetInput =
  | { readonly _tag: 'SignedOut' }
  | {
      readonly _tag: 'Ready'
      readonly tasks: CareTasksResponse
      readonly timezone: string
    }

const CARE_TYPE_RANK: Record<CareType, number> = {
  watering: 0,
  fertilization: 1,
  misting: 2,
  repotting: 3,
}

const careTypeOrder: Order.Order<CareType> = Order.mapInput(
  Order.Number,
  (type) => CARE_TYPE_RANK[type]
)

interface PlantDue {
  readonly plantId: string
  readonly plantName: string
  readonly careTypes: Array.NonEmptyReadonlyArray<CareType>
  readonly daysLate: number
}

const plantDueOrder: Order.Order<PlantDue> = Order.combineAll([
  Order.flip(Order.mapInput(Order.Number, (p: PlantDue) => p.daysLate)),
  Order.make((a: PlantDue, b: PlantDue) =>
    EffectString.localeCompare(b.plantName)(a.plantName)
  ),
  Order.mapInput(Order.String, (p: PlantDue) => p.plantId),
])

const toPlantDue =
  (day: number) =>
  (tasks: Array.NonEmptyReadonlyArray<CareTask>): PlantDue => {
    const first = Array.headNonEmpty(tasks)
    const oldestOffset = Array.min(
      Array.map(tasks, (task) => task.dueDayOffset),
      Order.Number
    )
    return {
      plantId: first.plantId,
      plantName: first.plantName,
      careTypes: Array.dedupe(
        Array.sort(
          Array.map(tasks, (task) => task.type),
          careTypeOrder
        )
      ),
      daysLate: day - oldestOffset,
    }
  }

const toRow =
  (copy: TodayWidgetCopy) =>
  (plant: PlantDue): TodayWidgetRow => ({
    plantId: plant.plantId,
    plantName: plant.plantName,
    careTypes: plant.careTypes,
    detail: Array.join(Array.map(plant.careTypes, copy.careAction), ' · '),
    lateLabel: plant.daysLate > 0 ? copy.daysLate(plant.daysLate) : null,
  })

const dayStatus = (
  plantCount: number,
  completedCount: number
): TodayWidgetDayStatus =>
  Match.value({ plantCount, completedCount }).pipe(
    Match.when({ plantCount: (n) => n > 0 }, () => 'due' as const),
    Match.when({ completedCount: (n) => n > 0 }, () => 'allDone' as const),
    Match.orElse(() => 'clear' as const)
  )

const daysUntilNextCare = (
  tasks: ReadonlyArray<CareTask>,
  day: number
): Option.Option<number> =>
  pipe(
    Array.filter(tasks, (task) => task.dueDayOffset > day),
    Array.map((task) => task.dueDayOffset - day),
    Array.match({
      onEmpty: () => Option.none(),
      onNonEmpty: (gaps) => Option.some(Array.min(gaps, Order.Number)),
    })
  )

const buildDay = (
  tasks: ReadonlyArray<CareTask>,
  completedToday: number,
  copy: TodayWidgetCopy,
  day: number,
  startsAt: DateTime.DateTime
): TodayWidgetDay => {
  const plants = pipe(
    Array.filter(tasks, (task) => task.dueDayOffset <= day),
    Array.groupBy((task) => task.plantId),
    Record.values,
    Array.map(toPlantDue(day)),
    Array.sort(plantDueOrder)
  )
  const plantCount = Array.length(plants)
  const completedCount = day === 0 ? completedToday : 0
  const status = dayStatus(plantCount, completedCount)
  const headline = Match.value(status).pipe(
    Match.when('due', () => copy.needsCare(plantCount)),
    Match.when('allDone', () => copy.allDone),
    Match.when('clear', () =>
      Option.match(daysUntilNextCare(tasks, day), {
        onNone: () => copy.nothingDue,
        onSome: copy.nextCareIn,
      })
    ),
    Match.exhaustive
  )
  const rows = pipe(
    plants,
    Array.take(TODAY_WIDGET_MAX_ROWS),
    Array.map(toRow(copy))
  )
  return {
    startsAt: DateTime.toEpochMillis(startsAt),
    status,
    plantCount,
    overdueCount: Array.length(Array.filter(plants, (p) => p.daysLate > 0)),
    completedCount,
    headline,
    caption: status === 'due' ? copy.needsCareCaption(plantCount) : headline,
    rows,
    // Entry k labels the plants hidden when the widget shows k + 1 rows.
    moreLabels: Array.map(rows, (_, index) =>
      plantCount - (index + 1) > 0
        ? copy.morePlants(plantCount - (index + 1))
        : null
    ),
  }
}

const buildReady = (
  response: CareTasksResponse,
  timezone: string,
  copy: TodayWidgetCopy
): Option.Option<TodayWidgetSnapshot> => {
  const tasks = Array.flatten([
    response.overdue,
    response.today,
    response.upcoming,
  ])
  return pipe(
    Option.liftPredicate(response.windowDays, Array.isReadonlyArrayNonEmpty),
    Option.flatMap((windowDays) =>
      Option.all({
        days: Option.all(
          Array.map(windowDays, (key, day) =>
            Option.map(startOfLocalDay(key, timezone), (startsAt) =>
              buildDay(tasks, response.completedToday, copy, day, startsAt)
            )
          )
        ),
        staleAt: startOfLocalDay(Array.lastNonEmpty(windowDays), timezone, 1),
      })
    ),
    Option.map(
      ({ days, staleAt }): TodayWidgetSnapshot => ({
        _tag: 'Ready',
        v: 1,
        title: copy.title,
        days,
        staleAt: DateTime.toEpochMillis(staleAt),
        staleMessage: copy.stale,
      })
    )
  )
}

export const buildTodayWidgetSnapshot = (
  input: TodayWidgetInput,
  copy: TodayWidgetCopy
): Option.Option<TodayWidgetSnapshot> =>
  Match.value(input).pipe(
    Match.tag('SignedOut', () =>
      Option.some<TodayWidgetSnapshot>({
        _tag: 'SignedOut',
        v: 1,
        title: copy.title,
        message: copy.signedOut,
      })
    ),
    Match.tag('Ready', ({ tasks, timezone }) =>
      buildReady(tasks, timezone, copy)
    ),
    Match.exhaustive
  )
