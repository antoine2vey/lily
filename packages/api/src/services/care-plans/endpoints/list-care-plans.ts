import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { SeenCarePlanList } from '@lily/api/services/care-plans/api'
import { asSeenBy } from '@lily/api/services/plants/helpers/seen'
import type { CarePlanStatus } from '@lily/shared/care-plan'
import { Array, Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const listCarePlans = (
  status?: CarePlanStatus
): Effect.Effect<
  SeenCarePlanList,
  SqlError,
  CarePlanRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* CarePlanRepository
    const { id: userId } = yield* CurrentUser
    const items = yield* repo.findByUser(userId, status)
    return { items: Array.map(items, asSeenBy(userId)) }
  }).pipe(Effect.withSpan('CarePlansService.listCarePlans'))
