import { renderHook, waitFor } from '@testing-library/react-native'
import { createQueryWrapper } from 'src/__tests__/utils/query-helpers'
import { useAchievements } from '../useAchievements'

describe('useAchievements', () => {
  it('returns achievements data when successful', async () => {
    const { result } = renderHook(() => useAchievements(), {
      wrapper: createQueryWrapper(),
    })

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toBeDefined()
    expect(result.current.data?.achievements).toBeInstanceOf(Array)
    expect(result.current.data?.level).toBeGreaterThan(0)
    expect(result.current.data?.unlockedCount).toBeGreaterThanOrEqual(0)
    expect(result.current.data?.totalCount).toBeGreaterThan(0)
  })

  it('returns achievements with correct shape', async () => {
    const { result } = renderHook(() => useAchievements(), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
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

  it('includes achievements from all categories', async () => {
    const { result } = renderHook(() => useAchievements(), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    const categories =
      result.current.data?.achievements.map((a) => a.category) ?? []
    expect(categories).toContain('plants')
    expect(categories).toContain('care')
    expect(categories).toContain('streaks')
    expect(categories).toContain('special')
  })

  it('provides refetch function', async () => {
    const { result } = renderHook(() => useAchievements(), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(typeof result.current.refetch).toBe('function')
  })

  it('calculates unlocked count correctly', async () => {
    const { result } = renderHook(() => useAchievements(), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    const data = result.current.data
    expect(data).toBeDefined()
    const actualUnlocked = data?.achievements.filter((a) => a.unlocked).length
    expect(data?.unlockedCount).toBe(actualUnlocked)
  })
})
