import { render, screen } from '@testing-library/react-native'

// Mock dependencies
jest.mock('@/hooks/useAchievements', () => ({
  useAchievements: jest.fn(),
}))

import { useAchievements } from 'src/hooks/useAchievements'
import { AchievementsScreen } from '../AchievementsScreen'

const mockedUseAchievements = useAchievements as jest.Mock

// Create mock achievements data
const mockAchievements = [
  {
    id: '1',
    key: 'first-plant',
    name: 'First Plant',
    description: 'Add your first plant',
    category: 'plants' as const,
    icon: 'seedling',
    unlocked: true,
    rarity: 'common' as const,
    unlockedAt: '2024-01-15T12:00:00Z',
  },
  {
    id: '2',
    key: 'green-thumb',
    name: 'Green Thumb',
    description: 'Successfully care for 10 plants',
    category: 'care' as const,
    icon: 'heart',
    unlocked: true,
    rarity: 'rare' as const,
    unlockedAt: '2024-02-20T15:30:00Z',
  },
  {
    id: '3',
    key: 'week-warrior',
    name: 'Week Warrior',
    description: 'Maintain a 7-day care streak',
    category: 'streaks' as const,
    icon: 'fire',
    unlocked: false,
    rarity: 'epic' as const,
    progress: 3,
    maxProgress: 7,
  },
]

describe('AchievementsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows loading state initially', () => {
    mockedUseAchievements.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    render(<AchievementsScreen />)

    // Screen returns null during initial loading (before skeleton delay)
    expect(screen.queryByText('Achievements')).toBeNull()
  })

  it('displays achievements title', () => {
    mockedUseAchievements.mockReturnValue({
      data: {
        achievements: mockAchievements,
        level: 3,
        unlockedCount: 5,
        totalCount: 20,
      },
      isLoading: false,
    })

    render(<AchievementsScreen />)

    expect(screen.getByText('Achievements')).toBeTruthy()
  })

  it('displays user level', () => {
    mockedUseAchievements.mockReturnValue({
      data: {
        achievements: mockAchievements,
        level: 5,
        unlockedCount: 10,
        totalCount: 20,
      },
      isLoading: false,
    })

    render(<AchievementsScreen />)

    expect(screen.getByText('Level 5')).toBeTruthy()
  })

  it('displays achievement progress', () => {
    mockedUseAchievements.mockReturnValue({
      data: {
        achievements: mockAchievements,
        level: 3,
        unlockedCount: 8,
        totalCount: 20,
      },
      isLoading: false,
    })

    render(<AchievementsScreen />)

    expect(screen.getByText('8 of 20 achievements')).toBeTruthy()
  })

  it('displays achievement categories', () => {
    mockedUseAchievements.mockReturnValue({
      data: {
        achievements: mockAchievements,
        level: 1,
        unlockedCount: 2,
        totalCount: 10,
      },
      isLoading: false,
    })

    render(<AchievementsScreen />)

    expect(screen.getByText('Plant Collection')).toBeTruthy()
    expect(screen.getByText('Plant Care')).toBeTruthy()
    expect(screen.getByText('Streaks')).toBeTruthy()
  })

  it('displays achievement cards', () => {
    mockedUseAchievements.mockReturnValue({
      data: {
        achievements: mockAchievements,
        level: 1,
        unlockedCount: 1,
        totalCount: 10,
      },
      isLoading: false,
    })

    render(<AchievementsScreen />)

    expect(screen.getByText('First Plant')).toBeTruthy()
  })

  it('displays progress bar', () => {
    mockedUseAchievements.mockReturnValue({
      data: {
        achievements: mockAchievements,
        level: 3,
        unlockedCount: 10,
        totalCount: 20,
      },
      isLoading: false,
    })

    render(<AchievementsScreen />)

    expect(screen.getByTestId('progress-bar')).toBeTruthy()
  })
})
