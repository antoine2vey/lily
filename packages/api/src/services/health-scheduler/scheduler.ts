import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { Effect } from 'effect'

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

export const startHealthScheduler = createScheduler({
  name: 'health-scheduler',
  interval: '1 hour',
  runOnStartup: true,
  task: checkOverduePlants,
})
