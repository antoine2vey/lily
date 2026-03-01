import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { Effect } from 'effect'
import type { DurationInput } from 'effect/Duration'

// Check every hour for overdue plants
const POLL_INTERVAL: DurationInput = '1 hour'

// Check plant health statuses and update accordingly
export const checkOverduePlants = Effect.gen(function* () {
  const plantRepo = yield* PlantRepository

  yield* Effect.log('Running health check...')

  // Mark overdue plants as NEEDS_ATTENTION
  const markedAsAttention = yield* plantRepo.markOverduePlantsAsNeedsAttention()

  if (markedAsAttention > 0) {
    yield* Effect.log('Marked overdue plants as needs attention', {
      count: markedAsAttention,
    })
  }

  // Reset plants that are marked NEEDS_ATTENTION but are actually in order
  const markedAsHealthy = yield* plantRepo.markHealthyPlantsInOrder()

  if (markedAsHealthy > 0) {
    yield* Effect.log('Reset plants to healthy (schedules in order)', {
      count: markedAsHealthy,
    })
  }
}).pipe(Effect.withSpan('health-scheduler.check'))

// Start the health status scheduler as a background process
export const startHealthScheduler = Effect.gen(function* () {
  // Run immediately on startup
  yield* checkOverduePlants.pipe(
    Effect.catchTag('SqlError', (error) =>
      Effect.logError('Health scheduler initial check error', error)
    )
  )

  // Then run periodically
  yield* Effect.fork(
    Effect.forever(
      Effect.sleep(POLL_INTERVAL).pipe(
        Effect.zipRight(
          checkOverduePlants.pipe(
            Effect.catchTag('SqlError', (error) =>
              Effect.logError('Health scheduler polling error', error)
            )
          )
        )
      )
    )
  )

  yield* Effect.log('Health status scheduler started')
})
