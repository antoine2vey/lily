import { Absence } from '@lily/api/contexts/absence'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { Effect } from 'effect'

export const pollAndTransition = Effect.flatMap(
  Absence,
  (absence) => absence.advanceDelegations
).pipe(
  Effect.tap((tally) =>
    tally.due > 0
      ? Effect.log(
          `[delegation-scheduler] Advanced ${tally.advanced} of ${tally.due} due delegations`,
          { failed: tally.failed }
        )
      : Effect.void
  ),
  Effect.withSpan('DelegationScheduler.pollAndTransition')
)

export const startDelegationScheduler = createScheduler({
  name: 'delegation-scheduler',
  interval: '5 minutes',
  runOnStartup: true,
  task: Effect.asVoid(pollAndTransition),
})
