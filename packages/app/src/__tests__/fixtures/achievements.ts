import type { AchievementWithProgress } from '@lily/shared/achievement'

export const mockUserAchievements: AchievementWithProgress[] = [
  {
    key: 'FIRST_PLANT_ADDED',
    name: 'First Plant',
    description: 'Add your first plant',
    icon: 'plant-icon',
    category: 'plants',
    rarity: 'common',
    unlocked: true,
    unlockedAt: new Date('2024-01-01'),
    progress: 1,
    maxProgress: 1,
  },
  {
    key: 'WATERING_NOVICE',
    name: 'Water Streak',
    description: 'Water plants 7 days in a row',
    icon: 'water-icon',
    category: 'streaks',
    rarity: 'rare',
    unlocked: false,
    unlockedAt: null,
    progress: 5,
    maxProgress: 7,
  },
  {
    key: 'PLANT_COLLECTOR',
    name: 'Plant Collector',
    description: 'Collect 10 plants',
    icon: 'collection-icon',
    category: 'plants',
    rarity: 'epic',
    unlocked: false,
    unlockedAt: null,
    progress: 3,
    maxProgress: 10,
  },
]

export const createTestUserAchievement = (
  overrides: Partial<AchievementWithProgress> = {}
): AchievementWithProgress => ({
  key: 'FIRST_PLANT_ADDED',
  name: 'Test Achievement',
  description: 'Test description',
  icon: 'test-icon',
  category: 'plants',
  rarity: 'common',
  unlocked: false,
  unlockedAt: null,
  progress: 0,
  maxProgress: 1,
  ...overrides,
})
