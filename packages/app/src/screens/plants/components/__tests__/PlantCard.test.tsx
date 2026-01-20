import { fireEvent, render, screen } from '@testing-library/react-native'
import { PlantCard } from '../PlantCard'

const mockPlant = {
  id: 'plant-1',
  name: 'Monstera Deliciosa',
  imageUrl: 'https://example.com/plant.jpg',
  health: 'healthy' as const,
  daysUntilWater: 2,
  needsWater: false,
}

describe('PlantCard', () => {
  it('renders plant image', () => {
    render(<PlantCard plant={mockPlant} onPress={jest.fn()} />)
    expect(screen.getByTestId('plant-image')).toBeTruthy()
  })

  it('renders plant name', () => {
    render(<PlantCard plant={mockPlant} onPress={jest.fn()} />)
    expect(screen.getByText('Monstera Deliciosa')).toBeTruthy()
  })

  it('renders health indicator dot', () => {
    render(<PlantCard plant={mockPlant} onPress={jest.fn()} />)
    expect(screen.getByTestId('health-dot')).toBeTruthy()
  })

  it('shows water indicator when daysUntilWater is set', () => {
    render(<PlantCard plant={mockPlant} onPress={jest.fn()} />)
    expect(screen.getByText('2 days')).toBeTruthy()
  })

  it('shows "Today" when daysUntilWater is 0', () => {
    const plantToday = { ...mockPlant, daysUntilWater: 0 }
    render(<PlantCard plant={plantToday} onPress={jest.fn()} />)
    expect(screen.getByText('Today')).toBeTruthy()
  })

  it('shows "Tomorrow" when daysUntilWater is 1', () => {
    const plantTomorrow = { ...mockPlant, daysUntilWater: 1 }
    render(<PlantCard plant={plantTomorrow} onPress={jest.fn()} />)
    expect(screen.getByText('Tomorrow')).toBeTruthy()
  })

  it('shows "Overdue" when needsWater is true', () => {
    const plantOverdue = { ...mockPlant, needsWater: true }
    render(<PlantCard plant={plantOverdue} onPress={jest.fn()} />)
    expect(screen.getByText('Overdue')).toBeTruthy()
  })

  it('calls onPress with plant id when pressed', () => {
    const onPress = jest.fn()
    render(<PlantCard plant={mockPlant} onPress={onPress} />)
    fireEvent.press(screen.getByTestId('plant-card-plant-1'))
    expect(onPress).toHaveBeenCalledWith('plant-1')
  })

  it('shows placeholder when no image', () => {
    const plantNoImage = { ...mockPlant, imageUrl: undefined }
    render(<PlantCard plant={plantNoImage} onPress={jest.fn()} />)
    expect(screen.getByTestId('plant-placeholder')).toBeTruthy()
  })

  it('renders health dot for attention status', () => {
    const plantAttention = { ...mockPlant, health: 'attention' as const }
    render(<PlantCard plant={plantAttention} onPress={jest.fn()} />)
    expect(screen.getByTestId('health-dot')).toBeTruthy()
  })

  it('renders health dot for critical status', () => {
    const plantCritical = { ...mockPlant, health: 'critical' as const }
    render(<PlantCard plant={plantCritical} onPress={jest.fn()} />)
    expect(screen.getByTestId('health-dot')).toBeTruthy()
  })
})
