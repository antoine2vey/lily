import type { Refusal, RefusalOf } from '@lily/api/contexts/care/domain/decide'
import { CareLogNotFoundError } from '@lily/shared/errors/care-log'
import {
  CarePlanNotFoundError,
  CarePlanNotProposedError,
  CarePlanStepNotFoundError,
} from '@lily/shared/errors/care-plan'
import {
  AlreadyCaredTodayError,
  FutureDateNotAllowedError,
  PlantAlreadyDeadError,
  PlantIsDeadError,
  PlantNotDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { UnauthorizedError } from '@lily/shared/errors/user'
import { Match } from 'effect'

const errorOf = {
  AlreadyCared: ({ careType }) => new AlreadyCaredTodayError({ careType }),
  FutureDay: () => new FutureDateNotAllowedError(),
  Dead: ({ plantId }) => new PlantIsDeadError({ plantId }),
  PlantGone: ({ plantId }) => new PlantNotFoundError({ plantId }),
  CareNotFound: ({ careLogId }) => new CareLogNotFoundError({ careLogId }),
  PlanGone: ({ planId }) => new CarePlanNotFoundError({ planId }),
  PlanOfDeadPlant: ({ planId }) => new CarePlanNotFoundError({ planId }),
  StepGone: ({ stepId }) => new CarePlanStepNotFoundError({ stepId }),
  PlanNotProposed: ({ planId, status }) =>
    new CarePlanNotProposedError({ planId, status }),
  ProposalForDeadPlant: ({ plantId }) => new PlantNotFoundError({ plantId }),
  AlreadyDead: () => new PlantAlreadyDeadError(),
  NotDead: () => new PlantNotDeadError(),
  OwnerFull: ({ error }) => error,
  ActorGone: ({ plantId }) => new PlantNotFoundError({ plantId }),
  CreatorGone: () =>
    new UnauthorizedError({ message: 'Authentication failed' }),
} satisfies {
  readonly [T in Refusal['_tag']]: (refusal: RefusalOf<T>) => unknown
}

export type ErrorOf<T extends Refusal['_tag']> = ReturnType<(typeof errorOf)[T]>

const refusalAsError = Match.type<Refusal>().pipe(Match.tagsExhaustive(errorOf))

export const asError = <R extends Refusal>(refusal: R) =>
  refusalAsError(refusal) as ErrorOf<R['_tag']>
