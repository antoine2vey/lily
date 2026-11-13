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
import { DateTime, Effect, Layer } from 'effect'

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
