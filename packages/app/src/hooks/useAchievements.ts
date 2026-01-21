import { useQuery } from '@tanstack/react-query'

type AchievementCategory = 'plants' | 'care' | 'streaks' | 'special'

interface Achievement {
  id: string
  name: string
  description: string
  category: AchievementCategory
  icon: string
  unlocked: boolean
  unlockedAt?: string
  progress?: number
  maxProgress?: number
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

interface AchievementsResponse {
  achievements: Achievement[]
  level: number
  unlockedCount: number
  totalCount: number
}

async function fetchAchievements(): Promise<AchievementsResponse> {
  // TODO: Implement actual API call when backend is ready
  // const response = await api.achievements.list()
  // return response

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  const achievements: Achievement[] = [
    // Plants category
    {
      id: 'first-plant',
      name: 'Plant Parent',
      description: 'Add your first plant',
      category: 'plants',
      icon: 'seedling',
      unlocked: true,
      unlockedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
      rarity: 'common',
    },
    {
      id: 'five-plants',
      name: 'Growing Collection',
      description: 'Add 5 plants to your collection',
      category: 'plants',
      icon: 'potted-plant',
      unlocked: true,
      unlockedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      rarity: 'common',
    },
    {
      id: 'ten-plants',
      name: 'Plant Enthusiast',
      description: 'Add 10 plants to your collection',
      category: 'plants',
      icon: 'garden',
      unlocked: false,
      progress: 6,
      maxProgress: 10,
      rarity: 'rare',
    },
    // Care category
    {
      id: 'first-water',
      name: 'First Drink',
      description: 'Water a plant for the first time',
      category: 'care',
      icon: 'water',
      unlocked: true,
      unlockedAt: new Date(Date.now() - 86400000 * 6).toISOString(),
      rarity: 'common',
    },
    {
      id: 'caretaker',
      name: 'Dedicated Caretaker',
      description: 'Log 50 care activities',
      category: 'care',
      icon: 'heart',
      unlocked: false,
      progress: 23,
      maxProgress: 50,
      rarity: 'rare',
    },
    // Streaks category
    {
      id: 'week-streak',
      name: 'Week Warrior',
      description: 'Maintain a 7-day care streak',
      category: 'streaks',
      icon: 'fire',
      unlocked: true,
      unlockedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      rarity: 'rare',
    },
    {
      id: 'month-streak',
      name: 'Monthly Master',
      description: 'Maintain a 30-day care streak',
      category: 'streaks',
      icon: 'trophy',
      unlocked: false,
      progress: 12,
      maxProgress: 30,
      rarity: 'epic',
    },
    // Special category
    {
      id: 'ai-identifier',
      name: 'Tech Savvy',
      description: 'Identify a plant using AI',
      category: 'special',
      icon: 'robot',
      unlocked: false,
      rarity: 'rare',
    },
    {
      id: 'chat-explorer',
      name: 'Curious Mind',
      description: 'Ask Lily 10 questions',
      category: 'special',
      icon: 'chat',
      unlocked: false,
      progress: 3,
      maxProgress: 10,
      rarity: 'common',
    },
  ]

  const unlockedCount = achievements.filter((a) => a.unlocked).length

  return {
    achievements,
    level: Math.floor(unlockedCount / 3) + 1,
    unlockedCount,
    totalCount: achievements.length,
  }
}

export function useAchievements() {
  return useQuery({
    queryKey: ['achievements'],
    queryFn: fetchAchievements,
  })
}
