import type { userAchievements } from '@lily/db'

type UserAchievement = typeof userAchievements.$inferSelect

export const mockUserAchievements: UserAchievement[] = [
  {
    id: 'ach-1',
    userId: 'user-1',
    achievement: 'FIRST_PLANT_ADDED',
    unlockedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: 'ach-2',
    userId: 'user-1',
    achievement: 'WATERING_NOVICE',
    unlockedAt: new Date('2024-02-01T14:30:00Z'),
  },
  {
    id: 'ach-3',
    userId: 'user-2',
    achievement: 'AI_CONVERSATIONALIST',
    unlockedAt: new Date('2024-02-10T09:00:00Z'),
  },
]

export const createTestUserAchievement = (
  overrides: Partial<UserAchievement> = {}
): UserAchievement => ({
  id: `ach-${crypto.randomUUID()}`,
  userId: 'user-1',
  achievement: 'FIRST_PLANT_ADDED',
  unlockedAt: new Date(),
  ...overrides,
})
