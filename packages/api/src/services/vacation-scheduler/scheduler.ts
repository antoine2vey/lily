import { Absence } from '@lily/api/contexts/absence'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { Effect } from 'effect'

export const pollAndTransitionVacations = Effect.flatMap(
  Absence,
  (absence) => absence.advanceVacations
).pipe(
  Effect.tap((tally) =>
    tally.due > 0
      ? Effect.log(
          `[vacation-scheduler] Advanced ${tally.advanced} of ${tally.due} due vacations`,
          { failed: tally.failed }
        )
      : Effect.void
  ),
  Effect.withSpan('VacationScheduler.pollAndTransition')
)

export const startVacationScheduler = createScheduler({
  name: 'vacation-scheduler',
  interval: '5 minutes',
  runOnStartup: true,
  task: Effect.asVoid(pollAndTransitionVacations),
})
