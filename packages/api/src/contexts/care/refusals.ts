import type { Refusal } from '@lily/api/contexts/care/domain/decide'
import { type RefusalTable, refusals } from '@lily/api/kernel/refusals'
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
  PlantNotAuthorizedError,
  PlantNotDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { UnauthorizedError } from '@lily/shared/errors/user'

const errorOf = {
  AlreadyCared: ({ careType }) => new AlreadyCaredTodayError({ careType }),
  FutureDay: () => new FutureDateNotAllowedError(),
  Dead: ({ plantId }) => new PlantIsDeadError({ plantId }),
  PlantGone: ({ plantId }) => new PlantNotFoundError({ plantId }),
  CareNotFound: ({ careLogId }) => new CareLogNotFoundError({ careLogId }),
  CareOfAnother: () => new PlantNotAuthorizedError(),
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
} satisfies RefusalTable<Refusal>

export const asError = refusals<Refusal>()(errorOf)
