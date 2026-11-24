import type { CapOf } from '@lily/api/contexts/reminders'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { hasPremiumAccess } from '@lily/api/services/subscriptions/has-premium-access'
import type { PlantOwner } from '@lily/shared'
import { Array, Effect, Filter, Match, Option, pipe, Record } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * How many living plants each owner may hold; none means no limit. A user has
 * the cap of the tier they have premium access to, else the free cap. A
 * Canopy shares the free cap unless one member has no limit.
 */
export const plantCapsFor = (
  owners: ReadonlyArray<PlantOwner>
): Effect.Effect<CapOf, SqlError, CanopyRepository | SubscriptionRepository> =>
  Effect.gen(function* () {
    const canopyRepo = yield* CanopyRepository
    const subRepo = yield* SubscriptionRepository

    const membersByCanopy = yield* canopyRepo.findMemberIdsByCanopyIds(
      pipe(
        owners,
        Array.filterMap(
          Filter.fromPredicateOption((owner) =>
            owner._tag === 'Canopy'
              ? Option.some(owner.canopyId)
              : Option.none()
          )
        ),
        Array.dedupe
      )
    )
    const userIds = pipe(
      Record.values(membersByCanopy),
      Array.flatten,
      Array.appendAll(
        Array.filterMap(
          owners,
          Filter.fromPredicateOption((owner) =>
            owner._tag === 'User' ? Option.some(owner.userId) : Option.none()
          )
        )
      ),
      Array.dedupe
    )

    const premiumTierByUserId = pipe(
      yield* subRepo.findByUserIds(userIds),
      Array.filter(hasPremiumAccess),
      Array.map((sub) => [sub.userId, sub.tier] as const),
      Record.fromEntries
    )
    const freeCap = (yield* subRepo.getTier('free')).maxPlants
    const capByPremiumTier = yield* pipe(
      Record.values(premiumTierByUserId),
      Array.dedupe,
      Array.filter((tier) => tier !== 'free'),
      Effect.forEach((tier) =>
        Effect.map(
          subRepo.getTier(tier),
          (config) => [tier, config.maxPlants] as const
        )
      ),
      Effect.map(Record.fromEntries)
    )

    const capOfUser = (userId: string): number | null =>
      pipe(
        Record.get(premiumTierByUserId, userId),
        Option.flatMap((tier) => Record.get(capByPremiumTier, tier)),
        Option.getOrElse(() => freeCap)
      )
    const capOfCanopy = (canopyId: string): number | null =>
      pipe(
        Record.get(membersByCanopy, canopyId),
        Option.getOrElse((): ReadonlyArray<string> => []),
        Array.some((userId) => capOfUser(userId) === null)
      )
        ? null
        : freeCap

    return (owner) =>
      Option.fromNullishOr(
        Match.value(owner).pipe(
          Match.tag('User', ({ userId }) => capOfUser(userId)),
          Match.tag('Canopy', ({ canopyId }) => capOfCanopy(canopyId)),
          Match.exhaustive
        )
      )
  })
