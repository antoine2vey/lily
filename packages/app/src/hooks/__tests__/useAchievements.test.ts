import { renderHook } from '@testing-library/react-native'
import { createQueryWrapper } from 'src/__tests__/utils/query-helpers'
import { useAchievements } from '../useAchievements'

jest.mock('@/utils/client', () => ({
  useEffectQuery: jest.fn().mockReturnValue({
    data: {
      achievements: [
        {
          id: 'ach-1',
          name: 'First Plant',
          description: 'Add your first plant',
          category: 'plants',
          icon: '🌱',
          unlocked: true,
          rarity: 'common',
        },
        {
          id: 'ach-2',
          name: 'Watering Novice',
          description: 'Water a plant 10 times',
          category: 'care',
          icon: '💧',
          unlocked: false,
          rarity: 'common',
        },
        {
          id: 'ach-3',
          name: 'Dedicated Caretaker',
          description: '7-day streak',
          category: 'streaks',
          icon: '🔥',
          unlocked: false,
          rarity: 'rare',
        },
        {
          id: 'ach-4',
          name: 'Rare Collector',
          description: 'Collect a rare plant',
          category: 'special',
          icon: '⭐',
          unlocked: false,
          rarity: 'legendary',
        },
      ],
      level: 1,
      unlockedCount: 1,
      totalCount: 4,
    },
    isLoading: false,
    isSuccess: true,
    refetch: jest.fn(),
  }),
}))

describe('useAchievements', () => {
  it('returns achievements data when successful', () => {
    const { result } = renderHook(() => useAchievements(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.data).toBeDefined()
    expect(result.current.data?.achievements).toBeInstanceOf(Array)
    expect(result.current.data?.level).toBeGreaterThan(0)
    expect(result.current.data?.unlockedCount).toBeGreaterThanOrEqual(0)
    expect(result.current.data?.totalCount).toBeGreaterThan(0)
  })

  it('returns achievements with correct shape', () => {
    const { result } = renderHook(() => useAchievements(), {
      wrapper: createQueryWrapper(),
    })

    const firstAchievement = result.current.data?.achievements[0]
    expect(firstAchievement).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
      category: expect.any(String),
      icon: expect.any(String),
      unlocked: expect.any(Boolean),
      rarity: expect.any(String),
    })
  })

  it('includes achievements from all categories', () => {
    const { result } = renderHook(() => useAchievements(), {
      wrapper: createQueryWrapper(),
    })

    const categories =
      result.current.data?.achievements.map(
        (a: { category: string }) => a.category
      ) ?? []
    expect(categories).toContain('plants')
    expect(categories).toContain('care')
    expect(categories).toContain('streaks')
    expect(categories).toContain('special')
  })

  it('provides refetch function', () => {
    const { result } = renderHook(() => useAchievements(), {
      wrapper: createQueryWrapper(),
    })

    expect(typeof result.current.refetch).toBe('function')
  })

  it('calculates unlocked count correctly', () => {
    const { result } = renderHook(() => useAchievements(), {
      wrapper: createQueryWrapper(),
    })

    const data = result.current.data
    expect(data).toBeDefined()
    const actualUnlocked = data?.achievements.filter(
      (a: { unlocked: boolean }) => a.unlocked
    ).length
    expect(data?.unlockedCount).toBe(actualUnlocked)
  })
})
