import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { AchievementRepositoryLive } from '@lily/api/repositories/achievement.repository'
import { DelegationRepositoryLive } from '@lily/api/repositories/delegation.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { SubscriptionRepositoryLive } from '@lily/api/repositories/subscription.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { DelegationService } from '@lily/api/services/delegation/service'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
import { Effect, Layer } from 'effect'

export const DelegationApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'delegations', (handlers) =>
    Effect.gen(function* () {
      const delegationService = yield* DelegationService

      return handlers
        .handle('createDelegation', ({ payload }) =>
          delegationService
            .createDelegation(payload)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('respondToDelegation', ({ path: { delegationId }, payload }) =>
          delegationService
            .respondToDelegation(delegationId, payload)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('cancelDelegation', ({ path: { delegationId } }) =>
          delegationService
            .cancelDelegation(delegationId)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('completeDelegation', ({ path: { delegationId } }) =>
          delegationService
            .completeDelegation(delegationId)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('getDelegation', ({ path: { delegationId } }) =>
          delegationService
            .getDelegation(delegationId)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('getMyDelegations', ({ urlParams }) =>
          delegationService
            .getMyDelegations(urlParams)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('getDelegatedTasks', () =>
          delegationService.getDelegatedTasks.pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(DelegationService.Default),
    Layer.provide(DelegationRepositoryLive),
    Layer.provide(NotificationRepositoryLive),
    Layer.provide(UserRepositoryLive),
    Layer.provide(LimitCheckerLive),
    Layer.provide(SubscriptionRepositoryLive),
    Layer.provide(AchievementRepositoryLive),
    Layer.provide(AuthenticationLive)
  )
