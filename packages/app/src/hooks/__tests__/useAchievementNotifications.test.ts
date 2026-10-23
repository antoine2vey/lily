import type { AchievementWithProgress } from '@lily/shared'
import { act, renderHook } from '@testing-library/react-native'
import { createTestUserAchievement } from '@/__tests__/fixtures/achievements'
import { useAchievementNotifications } from '../useAchievementNotifications'

let mockAchievements: AchievementWithProgress[] = []

jest.mock('@/hooks/useAchievements', () => ({
  useAchievements: () => ({ data: { achievements: mockAchievements } }),
}))

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}))

const catalog = (unlocked: readonly string[]) =>
  [
    'FIRST_PLANT_ADDED',
    'PLANT_COLLECTOR',
    'WATERING_NOVICE',
    'HISTORY_HERO',
  ].map((key) =>
    createTestUserAchievement({
      key: key as AchievementWithProgress['key'],
      unlocked: unlocked.includes(key),
    })
  )

const keys = (list: readonly AchievementWithProgress[]) =>
  list.map((a) => a.key)

describe('useAchievementNotifications', () => {
  it('queues every unlock from one refetch as a single deck', () => {
    mockAchievements = catalog(['FIRST_PLANT_ADDED'])
    const { result, rerender } = renderHook(() =>
      useAchievementNotifications(false)
    )
    expect(result.current.achievements).toEqual([])

    mockAchievements = catalog([
      'FIRST_PLANT_ADDED',
      'PLANT_COLLECTOR',
      'WATERING_NOVICE',
    ])
    rerender({})

    expect(keys(result.current.achievements)).toEqual([
      'PLANT_COLLECTOR',
      'WATERING_NOVICE',
    ])
  })

  it('keeps an unlock that lands after the shown pages when dismissing', () => {
    mockAchievements = catalog([])
    const { result, rerender } = renderHook(() =>
      useAchievementNotifications(false)
    )

    mockAchievements = catalog(['FIRST_PLANT_ADDED', 'PLANT_COLLECTOR'])
    rerender({})
    mockAchievements = catalog([
      'FIRST_PLANT_ADDED',
      'PLANT_COLLECTOR',
      'HISTORY_HERO',
    ])
    rerender({})
    expect(result.current.achievements).toHaveLength(3)

    act(() => result.current.dismiss(2))

    expect(keys(result.current.achievements)).toEqual(['HISTORY_HERO'])
  })
})
