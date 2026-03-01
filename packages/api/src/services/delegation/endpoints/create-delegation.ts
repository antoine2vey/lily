import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { scheduleSimpleNotification } from '@lily/api/services/helpers/schedule-notification'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import {
  CannotDelegateSelfError,
  type CreateDelegationRequest,
  DelegationDateError,
  DelegationNotFoundError,
  DelegationOverlapError,
  nowAsDate,
  UserNotFoundError,
} from '@lily/shared'
import { PlantNotAuthorizedError } from '@lily/shared/errors/plant'
import { Array, DateTime, Effect, Option, pipe } from 'effect'

export const createDelegation = (request: CreateDelegationRequest) =>
  Effect.gen(function* () {
    const { id: currentUserId, name: currentUserName } = yield* CurrentUser
    const delegationRepo = yield* DelegationRepository
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

    const startDateTime = DateTime.make(request.startDate)
    const endDateTime = DateTime.make(request.endDate)

    if (Option.isNone(startDateTime) || Option.isNone(endDateTime)) {
      return yield* Effect.fail(
        new DelegationDateError({ message: 'Invalid date format' })
      )
    }

    const startDate = DateTime.toDateUtc(startDateTime.value)
    const endDate = DateTime.toDateUtc(endDateTime.value)
    const now = nowAsDate()

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

    const plantRepo = yield* PlantRepository
    const plantIds = request.plantIds as string[]
    if (Array.isEmptyArray(plantIds)) {
      return yield* Effect.fail(
        new DelegationDateError({
          message: 'At least one plant must be selected',
        })
      )
    }

    // Verify all plants belong to the current user
    const plants = yield* plantRepo.findByIds(plantIds)
    const allOwned = Array.every(plants, (p) => p.userId === currentUserId)
    if (plants.length !== plantIds.length || !allOwned) {
      return yield* Effect.fail(new PlantNotAuthorizedError())
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

    yield* scheduleSimpleNotification(
      'delegation_request',
      request.caretakerId,
      { senderName: ownerName },
      caretaker.language
    )

    return yield* pipe(
      Option.fromNullable(detail),
      Option.match({
        onNone: () =>
          Effect.fail(
            new DelegationNotFoundError({ delegationId: delegation.id })
          ),
        onSome: Effect.succeed,
      })
    )
  }).pipe(Effect.withSpan('DelegationService.createDelegation'))
