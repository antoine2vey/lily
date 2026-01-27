import { fireEvent, render, screen } from '@testing-library/react-native'
import { AchievementCard } from '../AchievementCard'

describe('AchievementCard', () => {
  const mockOnPress = jest.fn()

  const unlockedAchievement = {
    key: 'FIRST_PLANT_ADDED',
    name: 'Green Thumb',
    description: 'Add your first plant',
    icon: 'seedling',
    unlocked: true,
    rarity: 'common' as const,
  }

  const lockedAchievement = {
    key: 'PLANT_COLLECTOR',
    name: 'Master Gardener',
    description: 'Have 50 plants',
    icon: 'garden',
    unlocked: false,
    progress: 25,
    maxProgress: 50,
    rarity: 'legendary' as const,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders achievement name', () => {
    render(
      <AchievementCard
        achievement={unlockedAchievement}
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('Green Thumb')).toBeTruthy()
  })

  it('renders achievement description', () => {
    render(
      <AchievementCard
        achievement={unlockedAchievement}
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('Add your first plant')).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    render(
      <AchievementCard
        achievement={unlockedAchievement}
        onPress={mockOnPress}
      />
    )

    fireEvent.press(screen.getByText('Green Thumb'))

    expect(mockOnPress).toHaveBeenCalledTimes(1)
  })

  it('shows progress for locked achievement with progress', () => {
    render(
      <AchievementCard achievement={lockedAchievement} onPress={mockOnPress} />
    )

    expect(screen.getByText('25/50')).toBeTruthy()
  })

  it('renders locked achievement differently', () => {
    render(
      <AchievementCard achievement={lockedAchievement} onPress={mockOnPress} />
    )

    expect(screen.getByText('Master Gardener')).toBeTruthy()
  })
})
