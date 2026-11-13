import {
  drainedOn,
  ManualOutboxLive,
} from '@lily/api/__tests__/integration/care-layers'
import { Absence, AbsenceLive } from '@lily/api/contexts/absence'
import { AbsenceLive as AbsenceOverAStore } from '@lily/api/contexts/absence/absence'
import {
  AbsenceStore,
  AbsenceStoreLive,
} from '@lily/api/contexts/absence/store'
import { CareLive } from '@lily/api/contexts/care'
import { Array, DateTime, Effect, Layer } from 'effect'
import type pg from 'pg'

export const AbsenceOnPostgresLive = AbsenceLive.pipe(
  Layer.provideMerge(CareLive),
  Layer.provideMerge(ManualOutboxLive)
)

export const settled = drainedOn(AbsenceOnPostgresLive)

export const returnFromVacation = (userId: string) =>
  Effect.flatMap(Absence, (absence) => absence.cancelVacation({ userId }))

export const leaveOnVacation = (
  userId: string,
  away: { readonly start: Date; readonly end: Date }
) =>
  Effect.flatMap(Absence, (absence) =>
    absence.setVacation({
      userId,
      start: DateTime.fromDateUnsafe(away.start),
      end: DateTime.fromDateUnsafe(away.end),
    })
  )

export const tickVacations = Effect.flatMap(
  Absence,
  (absence) => absence.advanceVacations
)

export const absenceOverStore = (
  seam: (store: AbsenceStore['Service']) => AbsenceStore['Service']
) =>
  Layer.fresh(
    AbsenceOverAStore.pipe(
      Layer.provide(
        Layer.effect(AbsenceStore, Effect.map(AbsenceStore, seam)).pipe(
          Layer.provide(AbsenceStoreLive),
          Layer.provide(CareLive)
        )
      )
    )
  )

export const waitsForALock = async (pool: pg.Pool, other: Promise<unknown>) => {
  let settled = false
  const mark = () => {
    settled = true
  }
  void other.then(mark, mark)
  for (const _ of Array.range(1, 100)) {
    const { rows } = await pool.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
    )
    if (settled) return false
    if ((rows[0]?.waiting ?? 0) > 0) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}
