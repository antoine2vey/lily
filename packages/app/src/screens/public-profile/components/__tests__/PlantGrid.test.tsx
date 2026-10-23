import { render, screen } from '@testing-library/react-native'
import { PlantGrid } from '../PlantGrid'

describe('PlantGrid', () => {
  it('keeps the section and shows an empty garden when there are no plants', () => {
    render(<PlantGrid plants={[]} />)
    expect(screen.getByText('Recent plants')).toBeTruthy()
    expect(screen.getByTestId('mascot-lookAround')).toBeTruthy()
    expect(screen.getByText('No plants to show')).toBeTruthy()
  })

  it('shows plants without the empty state', () => {
    render(
      <PlantGrid plants={[{ id: 'p1', name: 'Monstera', imageUrl: null }]} />
    )
    expect(screen.getByText('Monstera')).toBeTruthy()
    expect(screen.queryByTestId('mascot-lookAround')).toBeNull()
  })
})
