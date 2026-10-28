import type { KnowledgeView } from '@lily/api/services/plants/helpers/plant-access'
import type { CarePlan, CarePlanStatus } from '@lily/shared/care-plan'
import { Array, Match, Option, pipe } from 'effect'

export type CarePlanAction = 'manage' | 'tick'

type CarePlanRole = 'Author' | 'Steward' | 'Household'

const householdStatuses: ReadonlyArray<CarePlanStatus> = [
  'accepted',
  'completed',
]

const allowedRoles: Record<CarePlanAction, ReadonlyArray<CarePlanRole>> = {
  manage: ['Author', 'Steward'],
  tick: ['Author', 'Steward', 'Household'],
}

/**
 * `steward` marks the Canopy owner reading a plan whose author has left the
 * Canopy, so a shared plan never outlives everyone who may remove it.
 */
export const carePlanRole =
  (view: KnowledgeView, steward = false) =>
  (plan: Pick<CarePlan, 'userId' | 'status'>): Option.Option<CarePlanRole> =>
    pipe(
      Match.value({
        author: plan.userId === view.viewerId,
        shared:
          view._tag === 'Household' &&
          Array.contains(householdStatuses, plan.status),
      }),
      Match.when({ author: true }, () => Option.some<CarePlanRole>('Author')),
      Match.when({ shared: true }, () =>
        Option.some<CarePlanRole>(steward ? 'Steward' : 'Household')
      ),
      Match.orElse(() => Option.none())
    )

export const seesCarePlan =
  (view: KnowledgeView) =>
  (plan: Pick<CarePlan, 'userId' | 'status'>): boolean =>
    Option.isSome(carePlanRole(view)(plan))

export const carePlanAllows =
  (action: CarePlanAction) =>
  (role: CarePlanRole): boolean =>
    Array.contains(allowedRoles[action], role)
