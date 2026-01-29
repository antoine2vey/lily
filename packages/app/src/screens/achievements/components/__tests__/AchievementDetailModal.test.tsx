import { render, screen } from '@testing-library/react-native'
import { mockFixedDate } from 'src/__tests__/utils/dates'
import { AchievementDetailModal } from '../AchievementDetailModal'

describe('AchievementDetailModal', () => {
  const mockOnClose = jest.fn()

  const unlockedAchievement = {
    key: 'FIRST_PLANT_ADDED' as const,
    name: 'Green Thumb',
    description: 'Add your first plant to your collection',
    icon: 'seedling',
    unlocked: true,
    unlockedAt: mockFixedDate(2024, 6, 15, 10, 30),
    rarity: 'common' as const,
  }

  const lockedAchievement = {
    key: 'PLANT_COLLECTOR' as const,
    name: 'Master Gardener',
    description: 'Have 50 plants in your collection',
    icon: 'garden',
    unlocked: false,
    progress: 25,
    maxProgress: 50,
    rarity: 'legendary' as const,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders nothing when achievement is null', () => {
    const { toJSON } = render(
      <AchievementDetailModal
        visible={true}
        onClose={mockOnClose}
        achievement={null}
      />
    )

    expect(toJSON()).toBeNull()
  })

  it('renders achievement name in modal', () => {
    render(
      <AchievementDetailModal
        visible={true}
        onClose={mockOnClose}
        achievement={unlockedAchievement}
      />
    )

    expect(screen.getByText('Green Thumb')).toBeTruthy()
  })

  it('renders achievement description', () => {
    render(
      <AchievementDetailModal
        visible={true}
        onClose={mockOnClose}
        achievement={unlockedAchievement}
      />
    )

    expect(
      screen.getByText('Add your first plant to your collection')
    ).toBeTruthy()
  })

  it('renders rarity badge', () => {
    render(
      <AchievementDetailModal
        visible={true}
        onClose={mockOnClose}
        achievement={unlockedAchievement}
      />
    )

    expect(screen.getByText('Common')).toBeTruthy()
  })

  it('shows unlocked date for unlocked achievements', () => {
    render(
      <AchievementDetailModal
        visible={true}
        onClose={mockOnClose}
        achievement={unlockedAchievement}
      />
    )

    expect(screen.getByText(/Unlocked/i)).toBeTruthy()
  })

  it('shows progress for locked achievements with progress', () => {
    render(
      <AchievementDetailModal
        visible={true}
        onClose={mockOnClose}
        achievement={lockedAchievement}
      />
    )

    expect(screen.getByText('25 / 50 completed')).toBeTruthy()
  })

  it('shows locked message for locked achievements without progress', () => {
    const lockedNoProgress = {
      ...lockedAchievement,
      progress: null,
      maxProgress: null,
    }

    render(
      <AchievementDetailModal
        visible={true}
        onClose={mockOnClose}
        achievement={lockedNoProgress}
      />
    )

    expect(screen.getByText(/Keep going to unlock/i)).toBeTruthy()
  })
})
