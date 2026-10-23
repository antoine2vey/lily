import { fireEvent, render, screen } from '@testing-library/react-native'
import { createTestUserAchievement } from '@/__tests__/fixtures/achievements'
import { AchievementUnlockedModal } from '../AchievementUnlockedModal'

const first = createTestUserAchievement({
  key: 'FIRST_PLANT_ADDED',
  name: 'First Steps',
})
const second = createTestUserAchievement({
  key: 'HISTORY_HERO',
  name: 'History Hero',
  rarity: 'rare',
})

const layOutDeck = () =>
  fireEvent(screen.getByTestId('achievement-deck-frame'), 'layout', {
    nativeEvent: { layout: { width: 300, height: 400, x: 0, y: 0 } },
  })

describe('AchievementUnlockedModal', () => {
  it('renders nothing while no achievement is pending', () => {
    render(<AchievementUnlockedModal achievements={[]} onClose={jest.fn()} />)
    expect(screen.queryByText('Achievement Unlocked!')).toBeNull()
  })

  it('shows a single unlock with a Continue button', () => {
    render(
      <AchievementUnlockedModal achievements={[first]} onClose={jest.fn()} />
    )
    layOutDeck()

    expect(screen.getByText('Achievement Unlocked!')).toBeTruthy()
    expect(screen.getByText('First Steps')).toBeTruthy()
    expect(screen.getByText('Continue')).toBeTruthy()
    expect(screen.queryByText('Next')).toBeNull()
  })

  it('groups simultaneous unlocks into one deck, a mascot per page', () => {
    render(
      <AchievementUnlockedModal
        achievements={[first, second]}
        onClose={jest.fn()}
      />
    )
    layOutDeck()

    expect(screen.getByText('2 achievements unlocked!')).toBeTruthy()
    expect(screen.getByText('First Steps')).toBeTruthy()
    expect(screen.getByText('History Hero')).toBeTruthy()
    expect(screen.getAllByTestId('mascot-celebrate')).toHaveLength(2)
    expect(screen.getByText('Next')).toBeTruthy()
  })

  it('turns Next into Continue on the last page', () => {
    render(
      <AchievementUnlockedModal
        achievements={[first, second]}
        onClose={jest.fn()}
      />
    )
    layOutDeck()

    fireEvent.press(screen.getByText('Next'))
    expect(screen.getByText('Continue')).toBeTruthy()
    expect(screen.queryByText('Next')).toBeNull()
  })
})
