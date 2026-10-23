import { render, screen } from '@testing-library/react-native'
import { mockPlants } from '@/__tests__/fixtures/plants'
import { PlantSelector } from '../PlantSelector'

const noop = () => {}

describe('rooms PlantSelector', () => {
  it('tells the user every plant already has a room', () => {
    render(
      <PlantSelector
        plants={[]}
        hasPlants
        selectedIds={new Set()}
        onToggle={noop}
      />
    )
    expect(screen.getByTestId('mascot-celebrate')).toBeTruthy()
    expect(screen.getByText('Every plant has a room')).toBeTruthy()
  })

  it('tells a user without plants to add one instead', () => {
    render(
      <PlantSelector
        plants={[]}
        hasPlants={false}
        selectedIds={new Set()}
        onToggle={noop}
      />
    )
    expect(screen.getByTestId('mascot-jump')).toBeTruthy()
    expect(screen.getByText('No plants yet')).toBeTruthy()
    expect(screen.queryByText('Every plant has a room')).toBeNull()
  })

  it('lists assignable plants without an empty state', () => {
    render(
      <PlantSelector
        plants={mockPlants}
        hasPlants
        selectedIds={new Set()}
        onToggle={noop}
      />
    )
    expect(screen.getByText(mockPlants[0]!.name)).toBeTruthy()
    expect(screen.queryByTestId('mascot-celebrate')).toBeNull()
  })
})
