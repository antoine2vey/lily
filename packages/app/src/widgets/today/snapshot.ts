import { CareType } from '@lily/shared'
import { Schema } from 'effect'

export const TODAY_WIDGET_MAX_ROWS = 4

const EpochMillis = Schema.Int

export const TodayWidgetRow = Schema.Struct({
  plantId: Schema.String,
  plantName: Schema.String,
  careTypes: Schema.NonEmptyArray(CareType),
  detail: Schema.String,
  lateLabel: Schema.NullOr(Schema.String),
})

export const TodayWidgetDayStatus = Schema.Literals(['due', 'allDone', 'clear'])

export const TodayWidgetDay = Schema.Struct({
  startsAt: EpochMillis,
  status: TodayWidgetDayStatus,
  plantCount: Schema.Int,
  overdueCount: Schema.Int,
  completedCount: Schema.Int,
  headline: Schema.String,
  caption: Schema.String,
  rows: Schema.Array(TodayWidgetRow),
  moreLabels: Schema.Array(Schema.NullOr(Schema.String)),
})

const Version = Schema.Literal(1)

export const TodayWidgetSignedOut = Schema.TaggedStruct('SignedOut', {
  v: Version,
  title: Schema.String,
  message: Schema.String,
})

export const TodayWidgetReady = Schema.TaggedStruct('Ready', {
  v: Version,
  title: Schema.String,
  days: Schema.NonEmptyArray(TodayWidgetDay),
  staleAt: EpochMillis,
  staleMessage: Schema.String,
})

export const TodayWidgetSnapshot = Schema.Union([
  TodayWidgetSignedOut,
  TodayWidgetReady,
])

export type TodayWidgetRow = typeof TodayWidgetRow.Type
export type TodayWidgetDayStatus = typeof TodayWidgetDayStatus.Type
export type TodayWidgetDay = typeof TodayWidgetDay.Type
export type TodayWidgetSnapshot = typeof TodayWidgetSnapshot.Type

export const encodeTodayWidgetSnapshot: (
  snapshot: TodayWidgetSnapshot
) => string = Schema.encodeSync(Schema.fromJsonString(TodayWidgetSnapshot))
