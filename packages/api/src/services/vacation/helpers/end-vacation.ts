import type { SqlError } from '@effect/sql/SqlError'
import {
  CareScheduleRepository,
  type OwnerScheduleRow,
} from '@lily/api/repositories/care-schedule.repository'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { startOfDay } from '@lily/shared'
import { VACATION_MUTED_TOPICS } from '@lily/shared/server'
import { Array, DateTime, Duration, Effect, Option, pipe, Record } from 'effect'

export interface EndVacationParams {
  userId: string
  /** The stored vacationEnd (scheduler) or `now` (manual end-early). */
  effectiveEnd: Date
}

/**
 * End a user's vacation: shift the care schedules that fell due while they
 * were away, flip the status back to 'none', then rebuild care reminders.
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
 *
 * Ordering is deliberate:
 * 1. Shift — rerun-safe: shifted rows land past effectiveEnd, so a crashed
 *    run re-selects only not-yet-shifted rows on the next scheduler poll
 *    (status is still 'active', so the poll retries this routine).
 * 2. Flip status to 'none' — must happen BEFORE the reminder rebuild,
 *    because scheduleCareReminder skips recipients who are on vacation.
 * 3. Rebuild reminders for every schedule with a future nextCareAt. Write-
 *    time muting suppressed reminder creation during the vacation, and
 *    activation deleted the pending rows, so every reminder is recreated
 *    here. A crash mid-rebuild is self-healing: the overdue scheduler
 *    picks up any plant whose reminder row is missing once it falls due.
 */
export const endVacation = (
  params: EndVacationParams
): Effect.Effect<
  void,
  SqlError,
  | UserRepository
  | CareScheduleRepository
  | DelegationRepository
  | NotificationRepository
> =>
  Effect.gen(function* () {
    const { userId, effectiveEnd } = params
    const userRepo = yield* UserRepository
    const scheduleRepo = yield* CareScheduleRepository
    const delegationRepo = yield* DelegationRepository

    const user = yield* userRepo.findById(userId)
    const userOption = Option.fromNullable(user)
    const timezone = pipe(
      userOption,
      Option.flatMap((u) => Option.fromNullable(u.timezone)),
      Option.getOrElse(() => 'UTC')
    )
    // Missing vacationStart (defensive) degrades to delta 0 — the floor
    // clamp alone still moves overdue tasks to tomorrow.
    const vacationStart = pipe(
      userOption,
      Option.flatMap((u) => Option.fromNullable(u.vacationStart)),
      Option.getOrElse(() => effectiveEnd)
    )

    const effectiveEndDt = DateTime.unsafeMake(effectiveEnd)
    const deltaMs = DateTime.distance(
      startOfDay(DateTime.unsafeMake(vacationStart), timezone),
      startOfDay(effectiveEndDt, timezone)
    )
    const floorMs = DateTime.toEpochMillis(
      DateTime.addDuration(
        startOfDay(effectiveEndDt, timezone),
        Duration.days(1)
      )
    )
    const effectiveEndMs = DateTime.toEpochMillis(effectiveEndDt)

    const rows = yield* scheduleRepo.findByOwnerWithPlant(userId)

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
        Option.flatMap(Option.fromNullable),
        Option.isSome
      )

    // 1. Shift
    const shifted = yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const nextCareAt = row.schedule.nextCareAt
        if (nextCareAt === null || isDelegated(row.plant.id)) {
          return row
        }
        const nextMs = DateTime.toEpochMillis(DateTime.unsafeMake(nextCareAt))
        if (nextMs >= effectiveEndMs) {
          return row
        }
        const newNextCareAt = DateTime.toDateUtc(
          DateTime.unsafeMake(Math.max(nextMs + deltaMs, floorMs))
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

    // Sweep muted pending rows that slipped in during the vacation (e.g.
    // trial_ending is created regardless of vacation and would otherwise
    // deliver stale after return). Care reminders are rebuilt fresh below.
    const notificationRepo = yield* NotificationRepository
    yield* notificationRepo.deletePendingByUserIdAndTypes(
      userId,
      VACATION_MUTED_TOPICS
    )

    // 2. Clear vacation state — before the rebuild, see ordering note above.
    yield* userRepo.update(userId, {
      vacationStatus: 'none',
      vacationStart: null,
      vacationEnd: null,
    })

    // 3. Rebuild reminders for every schedule that is due in the future.
    // scheduleCareReminder is idempotent (delete-then-insert) and resolves
    // delegation routing itself, so delegated plants harmlessly refresh
    // their caretaker's row.
    const nowMs = DateTime.toEpochMillis(DateTime.unsafeNow())
    yield* Effect.forEach(
      Array.filter(
        shifted,
        (row) =>
          row.schedule.nextCareAt !== null &&
          DateTime.toEpochMillis(DateTime.unsafeMake(row.schedule.nextCareAt)) >
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
  }).pipe(
    Effect.withSpan('VacationService.endVacation', {
      attributes: { 'user.id': params.userId },
    })
  )
