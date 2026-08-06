import { DateTime, Match, Option, pipe, Schema } from 'effect'

export const VacationStatus = Schema.Literal('none', 'scheduled', 'active')
export type VacationStatus = typeof VacationStatus.Type

export const VacationState = Schema.Struct({
  status: VacationStatus,
  startDate: Schema.NullOr(Schema.Date),
  endDate: Schema.NullOr(Schema.Date),
})
export type VacationState = typeof VacationState.Type

export const SetVacationRequest = Schema.Struct({
  startDate: Schema.Date,
  endDate: Schema.Date,
})
export type SetVacationRequest = typeof SetVacationRequest.Type

// Maximum vacation length accepted by the API.
export const VACATION_MAX_DURATION_DAYS = 365

// The subset of the user row the vacation predicate needs — satisfied by the
// full DB row and by UserNotificationSettings alike.
export interface VacationFields {
  readonly vacationStatus: VacationStatus
  readonly vacationStart: Date | null
  readonly vacationEnd: Date | null
}

/**
 * Whether care/engagement notifications are muted for this user right now.
 *
 * The 'scheduled' clause covers the window between `vacationStart` and the
 * vacation-scheduler's next poll (up to 5 minutes), so nothing leaks while
 * the status flip is pending.
 */
export const isOnVacation = (user: VacationFields, nowDate: Date): boolean =>
  Match.value(user.vacationStatus).pipe(
    Match.when('active', () => true),
    Match.when('scheduled', () =>
      pipe(
        Option.all({
          start: Option.fromNullable(user.vacationStart),
          end: Option.fromNullable(user.vacationEnd),
        }),
        Option.match({
          onNone: () => false,
          onSome: ({ start, end }) => {
            const nowDt = DateTime.unsafeMake(nowDate)
            return (
              DateTime.lessThanOrEqualTo(DateTime.unsafeMake(start), nowDt) &&
              DateTime.greaterThan(DateTime.unsafeMake(end), nowDt)
            )
          },
        })
      )
    ),
    Match.when('none', () => false),
    Match.exhaustive
  )
