import {
  CareScheduleRepository,
  type OwnerScheduleRow,
} from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  UserRepository,
  type VacationSnapshot,
} from '@lily/api/repositories/user.repository'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import type { users } from '@lily/db/schema'
import { startOfDay } from '@lily/shared'
import { VACATION_MUTED_TOPICS } from '@lily/shared/server'
import { Array, DateTime, Duration, Effect, Option, pipe, Record } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export interface EndVacationParams {
  readonly user: VacationSnapshot & Pick<typeof users.$inferSelect, 'timezone'>
  /** The stored vacationEnd (scheduler) or `now` (manual end-early). */
  readonly effectiveEnd: Date
}

/**
 * End a user's vacation: claim the transition, shift the care schedules
 * that fell due while they were away, then rebuild care reminders.
 *
 * Shift (mirrors correct-care-dates.ts): each non-delegated schedule with
 * `nextCareAt < effectiveEnd` moves forward by the whole-local-day delta
 * between vacationStart and effectiveEnd, clamped to no earlier than the
 * start of the day after effectiveEnd ("tomorrow"). Applying the delta —
 * instead of resetting from today — preserves relative spacing between
 * plants and any weather adjustment baked into nextCareAt. The clamp gives
 * tasks that were already overdue before the vacation a gentle restart.
 *
 * Plants with an active caretaker are skipped: the caretaker maintained
 * their schedules, and their reminder rows route to the caretaker.
 */
export const endVacation = (
  params: EndVacationParams
): Effect.Effect<
  typeof users.$inferSelect | null,
  SqlError,
  | UserRepository
  | CareScheduleRepository
  | DelegationRepository
  | NotificationRepository
  | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(endVacationInTransaction(params))
  }).pipe(
    Effect.withSpan('VacationService.endVacation', {
      attributes: { 'user.id': params.user.id },
    })
  )

const endVacationInTransaction = (params: EndVacationParams) =>
  Effect.gen(function* () {
    const { user, effectiveEnd } = params
    const userRepo = yield* UserRepository
    const scheduleRepo = yield* CareScheduleRepository
    const delegationRepo = yield* DelegationRepository

    const claimed = yield* userRepo.transitionVacation(user, {
      vacationStatus: 'none',
      vacationStart: null,
      vacationEnd: null,
    })
    if (!claimed) {
      return null
    }

    const timezone = pipe(
      Option.fromNullishOr(user.timezone),
      Option.getOrElse(() => 'UTC')
    )
    // Missing vacationStart (defensive) degrades to delta 0 — the floor
    // clamp alone still moves overdue tasks to tomorrow.
    const vacationStart = pipe(
      Option.fromNullishOr(user.vacationStart),
      Option.getOrElse(() => effectiveEnd)
    )

    const effectiveEndDt = DateTime.makeUnsafe(effectiveEnd)
    const deltaMs = Duration.toMillis(
      DateTime.distance(
        startOfDay(DateTime.makeUnsafe(vacationStart), timezone),
        startOfDay(effectiveEndDt, timezone)
      )
    )
    const floorMs = DateTime.toEpochMillis(
      DateTime.addDuration(
        startOfDay(effectiveEndDt, timezone),
        Duration.days(1)
      )
    )
    const effectiveEndMs = DateTime.toEpochMillis(effectiveEndDt)

    const rows = yield* scheduleRepo.findByOwnerWithPlant(user.id)

    // One caretaker lookup per plant, not per schedule row.
    const plantIds = pipe(
      Array.map(rows, (row) => row.plant.id),
      Array.dedupe
    )
    const caretakerEntries = yield* Effect.forEach(plantIds, (plantId) =>
      delegationRepo
        .findActiveCaretakerForPlant(plantId)
        .pipe(Effect.map((caretakerId) => [plantId, caretakerId] as const))
    )
    const caretakerByPlant = Record.fromEntries(caretakerEntries)

    const isDelegated = (plantId: string): boolean =>
      pipe(
        Record.get(caretakerByPlant, plantId),
        Option.flatMap(Option.fromNullishOr),
        Option.isSome
      )

    const shifted = yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const nextCareAt = row.schedule.nextCareAt
        if (nextCareAt === null || isDelegated(row.plant.id)) {
          return row
        }
        const nextMs = DateTime.toEpochMillis(DateTime.makeUnsafe(nextCareAt))
        if (nextMs >= effectiveEndMs) {
          return row
        }
        const newNextCareAt = DateTime.toDateUtc(
          DateTime.makeUnsafe(Math.max(nextMs + deltaMs, floorMs))
        )
        yield* scheduleRepo.updateByPlantAndType(
          row.plant.id,
          row.schedule.careType,
          { nextCareAt: newNextCareAt }
        )
        return {
          ...row,
          schedule: { ...row.schedule, nextCareAt: newNextCareAt },
        } satisfies OwnerScheduleRow
      })
    )

    const notificationRepo = yield* NotificationRepository
    yield* notificationRepo.deletePendingByUserIdAndTypes(
      user.id,
      VACATION_MUTED_TOPICS
    )

    const nowMs = DateTime.toEpochMillis(DateTime.nowUnsafe())
    yield* Effect.forEach(
      Array.filter(
        shifted,
        (row) =>
          row.schedule.nextCareAt !== null &&
          DateTime.toEpochMillis(DateTime.makeUnsafe(row.schedule.nextCareAt)) >
            nowMs
      ),
      (row) =>
        scheduleCareReminder({
          plantId: row.plant.id,
          userId: row.plant.userId,
          type: `${row.schedule.careType}_reminder` as const,
          // biome-ignore lint/style/noNonNullAssertion: filtered non-null above
          scheduledDate: row.schedule.nextCareAt!,
          remindersEnabled: row.plant.remindersEnabled,
        })
    )
    return claimed
  })
