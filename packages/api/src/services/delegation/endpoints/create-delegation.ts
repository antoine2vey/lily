import { Absence } from '@lily/api/contexts/absence'
import { transact } from '@lily/api/kernel/transact'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { delegationDetail } from '@lily/api/services/delegation/helpers/delegation-detail'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { type CreateDelegationRequest, DelegationDateError } from '@lily/shared'
import { DateTime, Effect, Option } from 'effect'

const parsedPeriod = (request: CreateDelegationRequest) =>
  Option.match(
    Option.all({
      start: DateTime.make(request.startDate),
      end: DateTime.make(request.endDate),
    }),
    {
      onNone: () =>
        Effect.fail(
          new DelegationDateError({ message: 'Invalid date format' })
        ),
      onSome: ({ start, end }) =>
        Effect.succeed({
          start: DateTime.toUtc(start),
          end: DateTime.toUtc(end),
        }),
    }
  )

export const createDelegation = Effect.fn('DelegationService.createDelegation')(
  function* (request: CreateDelegationRequest) {
    const { id: by } = yield* CurrentUser
    const limitChecker = yield* LimitChecker
    yield* limitChecker.checkDelegationAccess(by)
    const { start, end } = yield* parsedPeriod(request)
    const absence = yield* Absence
    return yield* transact(
      Effect.flatMap(
        absence.openDelegation({
          by,
          caretakerId: request.caretakerId,
          start,
          end,
          message: Option.fromNullishOr(request.message),
          plantIds: request.plantIds,
        }),
        ({ delegationId }) => delegationDetail(delegationId)
      )
    )
  }
)
