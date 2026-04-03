import {
  EngagementRepository,
  type IEngagementRepository,
  type PlantAnniversary,
  type PlantWithoutRecentPhoto,
  type TrialingUser,
  type UserWithSettings,
} from '@lily/api/repositories/engagement.repository'
import { Effect, Layer, Option, pipe } from 'effect'

interface MockEngagementRepositoryData {
  usersWithTips?: ReadonlyArray<UserWithSettings>
  lastCareDates?: Record<string, Date | null>
  plantCounts?: Record<string, number>
  plantNames?: Record<string, ReadonlyArray<string>>
  plantsWithoutRecentPhoto?: Record<
    string,
    ReadonlyArray<PlantWithoutRecentPhoto>
  >
  notificationsInPeriod?: Record<string, boolean>
  notificationsForPlantInPeriod?: Record<string, boolean>
  healthyPlantCounts?: Record<string, number>
  careLogsForWeek?: Record<string, number>
  trialingUsers?: ReadonlyArray<TrialingUser>
  plantsWithAnniversary?: ReadonlyArray<PlantAnniversary>
}

export const createMockEngagementRepository = (
  data: MockEngagementRepositoryData = {}
): Layer.Layer<EngagementRepository> => {
  const usersWithTips = pipe(
    Option.fromNullable(data.usersWithTips),
    Option.getOrElse(() => [] as ReadonlyArray<UserWithSettings>)
  )
  const lastCareDates = pipe(
    Option.fromNullable(data.lastCareDates),
    Option.getOrElse(() => ({}) as Record<string, Date | null>)
  )
  const plantCounts = pipe(
    Option.fromNullable(data.plantCounts),
    Option.getOrElse(() => ({}) as Record<string, number>)
  )
  const plantNames = pipe(
    Option.fromNullable(data.plantNames),
    Option.getOrElse(() => ({}) as Record<string, ReadonlyArray<string>>)
  )
  const plantsWithoutRecentPhoto = pipe(
    Option.fromNullable(data.plantsWithoutRecentPhoto),
    Option.getOrElse(
      () => ({}) as Record<string, ReadonlyArray<PlantWithoutRecentPhoto>>
    )
  )
  const notificationsInPeriod = pipe(
    Option.fromNullable(data.notificationsInPeriod),
    Option.getOrElse(() => ({}) as Record<string, boolean>)
  )
  const notificationsForPlantInPeriod = pipe(
    Option.fromNullable(data.notificationsForPlantInPeriod),
    Option.getOrElse(() => ({}) as Record<string, boolean>)
  )

  const repo: IEngagementRepository = {
    getUsersWithTipsEnabled: () => Effect.succeed(usersWithTips),

    getLastCareDate: (userId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(lastCareDates[userId]),
          Option.getOrElse(() => null)
        )
      ),

    getPlantCountForUser: (userId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(plantCounts[userId]),
          Option.getOrElse(() => 0)
        )
      ),

    getPlantNamesForUser: (userId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(plantNames[userId]),
          Option.getOrElse(() => [] as ReadonlyArray<string>)
        )
      ),

    getPlantsWithoutRecentPhoto: (userId: string, _beforeDate: Date) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(plantsWithoutRecentPhoto[userId]),
          Option.getOrElse(() => [] as ReadonlyArray<PlantWithoutRecentPhoto>)
        )
      ),

    hasNotificationInPeriod: (userId: string, type: string, _sinceDate: Date) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(notificationsInPeriod[`${userId}:${type}`]),
          Option.getOrElse(() => false)
        )
      ),

    hasNotificationForPlantInPeriod: (
      userId: string,
      type: string,
      plantId: string,
      _sinceDate: Date
    ) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(
            notificationsForPlantInPeriod[`${userId}:${type}:${plantId}`]
          ),
          Option.getOrElse(() => false)
        )
      ),

    getUsersWithCareRemindersEnabled: () => Effect.succeed(usersWithTips),

    getUsersWithWeeklyDigestEnabled: () => Effect.succeed(usersWithTips),

    getTrialingUsersWithTrialEndingSoon: () =>
      Effect.succeed(
        pipe(
          Option.fromNullable(data.trialingUsers),
          Option.getOrElse(() => [] as ReadonlyArray<TrialingUser>)
        )
      ),

    getPlantsWithAnniversary: () =>
      Effect.succeed(
        pipe(
          Option.fromNullable(data.plantsWithAnniversary),
          Option.getOrElse(() => [] as ReadonlyArray<PlantAnniversary>)
        )
      ),

    getHealthyPlantCountForUser: (userId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(data.healthyPlantCounts),
          Option.flatMap((counts) => Option.fromNullable(counts[userId])),
          Option.getOrElse(() => 0)
        )
      ),

    getCareLogsCountForWeek: (userId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(data.careLogsForWeek),
          Option.flatMap((counts) => Option.fromNullable(counts[userId])),
          Option.getOrElse(() => 0)
        )
      ),
  }

  return Layer.succeed(EngagementRepository, repo)
}
