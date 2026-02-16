import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import {
  CannotDelegateSelfError,
  type CreateDelegationRequest,
  DelegationDateError,
  DelegationOverlapError,
  UserNotFoundError,
} from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

export const createDelegation = (request: CreateDelegationRequest) =>
  Effect.gen(function* () {
    const { id: currentUserId, name: currentUserName } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository
    const notificationRepo = yield* NotificationRepository
    const userRepo = yield* UserRepository
    const limitChecker = yield* LimitChecker

    yield* limitChecker.checkDelegationAccess(currentUserId)

    if (currentUserId === request.caretakerId) {
      return yield* Effect.fail(new CannotDelegateSelfError())
    }

    const caretaker = yield* userRepo.findById(request.caretakerId)
    if (!caretaker) {
      return yield* Effect.fail(
        new UserNotFoundError({ userId: request.caretakerId })
      )
    }

    const startDate = new Date(request.startDate)
    const endDate = new Date(request.endDate)
    const now = new Date()

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return yield* Effect.fail(
        new DelegationDateError({ message: 'Invalid date format' })
      )
    }

    if (startDate < now) {
      return yield* Effect.fail(
        new DelegationDateError({
          message: 'Start date must be in the future',
        })
      )
    }

    if (endDate <= startDate) {
      return yield* Effect.fail(
        new DelegationDateError({
          message: 'End date must be after start date',
        })
      )
    }

    const plantIds = request.plantIds as string[]
    if (Array.isEmptyArray(plantIds)) {
      return yield* Effect.fail(
        new DelegationDateError({
          message: 'At least one plant must be selected',
        })
      )
    }

    const overlapping = yield* delegationRepo.findOverlappingDelegations({
      plantIds,
      startDate,
      endDate,
    })

    if (Array.isNonEmptyArray(overlapping)) {
      return yield* Effect.fail(
        new DelegationOverlapError({ plantIds: overlapping })
      )
    }

    const delegation = yield* delegationRepo.create({
      ownerId: currentUserId,
      caretakerId: request.caretakerId,
      startDate,
      endDate,
      message: request.message,
    })

    yield* delegationRepo.addPlants(delegation.id, plantIds)

    const detail = yield* delegationRepo.findById(delegation.id)

    const ownerName = pipe(
      Option.fromNullable(currentUserName),
      Option.getOrElse(() => 'Someone')
    )

    const { title, body } = buildSimpleContent(
      'delegation_request',
      { senderName: ownerName },
      caretaker.language
    )

    yield* notificationRepo.create({
      userId: request.caretakerId,
      type: 'delegation_request',
      title,
      body,
      scheduledAt: new Date(),
    })

    return detail!
  }).pipe(Effect.withSpan('DelegationService.createDelegation'))
