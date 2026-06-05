import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import { createMockRoomRepository } from '@lily/api/__tests__/mocks/room.repository'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { getUserOverview } from '@lily/api/services/admin/endpoints/get-user-overview'
import type {
  rooms,
  userAchievements,
  userSubscriptions,
} from '@lily/db/schema'
import type { CareLog } from '@lily/shared/care-log'
import type { DeviceToken } from '@lily/shared/device-token'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

type SubRow = typeof userSubscriptions.$inferSelect
type AchievementRow = typeof userAchievements.$inferSelect
type RoomRow = typeof rooms.$inferSelect

const makeSubRow = (overrides: Partial<SubRow> = {}): SubRow => ({
  id: 'sub-1',
  userId: 'user-1',
  tier: 'paid',
  status: 'active',
  trialStartsAt: null,
  trialEndsAt: null,
  currentPeriodStart: new Date('2026-01-01'),
  currentPeriodEnd: new Date('2099-12-31'),
  canceledAt: null,
  externalSubscriptionId: null,
  externalCustomerId: null,
  provider: 'revenuecat',
  productId: null,
  store: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
})

const makeAchievement = (
  achievement: AchievementRow['achievement']
): AchievementRow => ({
  id: `ach-${achievement}`,
  userId: 'user-1',
  achievement,
  unlockedAt: new Date(),
})

const makeRoom = (id: string): RoomRow => ({
  id,
  name: `Room ${id}`,
  icon: 'plant',
  luminosity: null,
  orientation: null,
  isOutdoor: false,
  order: 0,
  userId: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
})

const makeDeviceToken = (isActive: boolean): DeviceToken => ({
  id: `dt-${crypto.randomUUID()}`,
  token: `tok-${crypto.randomUUID()}`,
  platform: 'ios',
  isActive,
  userId: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
})

const makeCareLog = (id: string): CareLog => ({
  id,
  type: 'watering',
  notes: undefined,
  date: new Date(),
  photoUrl: undefined,
  plantId: 'plant-1',
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('getUserOverview', () => {
  it('composes profile + subscription + stats', async () => {
    const result = await Effect.runPromise(
      getUserOverview('user-1').pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockUserRepository(mockUsers),
            createMockSubscriptionRepository({}),
            createMockCareLogRepository(
              [makeCareLog('cl-1'), makeCareLog('cl-2')],
              { countByUser: { 'user-1': 5 } }
            ),
            createMockAchievementRepository({
              achievements: [
                makeAchievement('FIRST_PLANT_ADDED'),
                makeAchievement('WATERING_NOVICE'),
                makeAchievement('PLANT_COLLECTOR'),
              ],
              plantCount: 2,
            }),
            createMockDeviceTokenRepository([
              makeDeviceToken(true),
              makeDeviceToken(false),
            ]),
            createMockRoomRepository([makeRoom('room-1'), makeRoom('room-2')])
          )
        )
      )
    )

    expect(result.user.id).toBe('user-1')
    expect(result.stats.plantCount).toBe(2)
    expect(result.stats.careLogsCount).toBe(5)
    expect(result.stats.achievementsCount).toBe(3)
    // Only the active device token is counted.
    expect(result.stats.activeDeviceCount).toBe(1)
    expect(result.stats.roomsCount).toBe(2)
    expect(result.subscription.subscription).toBeNull()
    expect(result.subscription.tierConfig.tier).toBe('free')
    expect(result.isStorePayer).toBe(false)
    expect(result.recentActivity.length).toBe(2)
  })

  it('fails with UserNotFoundError when the user does not exist', async () => {
    const result = await Effect.runPromiseExit(
      getUserOverview('non-existent').pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockUserRepository(mockUsers),
            createMockSubscriptionRepository({}),
            createMockCareLogRepository([]),
            createMockAchievementRepository({ achievements: [] }),
            createMockDeviceTokenRepository([]),
            createMockRoomRepository([])
          )
        )
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('flags isStorePayer for an active paid sub with an external id', async () => {
    const result = await Effect.runPromise(
      getUserOverview('user-1').pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockUserRepository(mockUsers),
            createMockSubscriptionRepository({
              subscription: makeSubRow({
                externalSubscriptionId: 'rc_123',
                store: 'APP_STORE',
                productId: 'lily_monthly',
              }),
              tier: 'paid',
            }),
            createMockCareLogRepository([], { countByUser: { 'user-1': 0 } }),
            createMockAchievementRepository({
              achievements: [],
              plantCount: 0,
            }),
            createMockDeviceTokenRepository([]),
            createMockRoomRepository([])
          )
        )
      )
    )

    expect(result.isStorePayer).toBe(true)
    expect(result.store).toBe('APP_STORE')
    expect(result.productId).toBe('lily_monthly')
  })

  it('does not flag isStorePayer for an admin-gifted sub (no external id)', async () => {
    const result = await Effect.runPromise(
      getUserOverview('user-1').pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockUserRepository(mockUsers),
            createMockSubscriptionRepository({
              subscription: makeSubRow({ externalSubscriptionId: null }),
              tier: 'paid',
            }),
            createMockCareLogRepository([]),
            createMockAchievementRepository({ achievements: [] }),
            createMockDeviceTokenRepository([]),
            createMockRoomRepository([])
          )
        )
      )
    )

    expect(result.isStorePayer).toBe(false)
  })
})
