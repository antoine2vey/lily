import { fireEvent, render, screen } from '@testing-library/react-native'
import { PlantCard } from '../components/PlantCard'

describe('PlantCard', () => {
  const mockOnPress = jest.fn()

  const basePlant = {
    id: 'plant-1',
    name: 'Monstera Deliciosa',
    health: 'healthy' as const,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders plant name', () => {
    render(<PlantCard plant={basePlant} onPress={mockOnPress} />)

    expect(screen.getByText('Monstera Deliciosa')).toBeTruthy()
  })

  it('displays plant image when imageUrl provided', () => {
    const plantWithImage = {
      ...basePlant,
      imageUrl: 'https://example.com/plant.jpg',
    }

    render(<PlantCard plant={plantWithImage} onPress={mockOnPress} />)

    expect(screen.getByTestId('plant-image')).toBeTruthy()
  })

  it('displays placeholder when no imageUrl', () => {
    render(<PlantCard plant={basePlant} onPress={mockOnPress} />)

    expect(screen.getByTestId('plant-placeholder')).toBeTruthy()
  })

  it('calls onPress with plant id when pressed', () => {
    render(<PlantCard plant={basePlant} onPress={mockOnPress} />)

    fireEvent.press(screen.getByTestId('plant-card-plant-1'))

    expect(mockOnPress).toHaveBeenCalledWith('plant-1')
  })

  it('shows health indicator dot', () => {
    render(<PlantCard plant={basePlant} onPress={mockOnPress} />)

    expect(screen.getByTestId('health-dot')).toBeTruthy()
  })

  it('shows "Overdue" when plant needs water', () => {
    const overdueWaterPlant = {
      ...basePlant,
      needsWater: true,
      daysUntilWater: 0,
    }

    render(<PlantCard plant={overdueWaterPlant} onPress={mockOnPress} />)

    expect(screen.getByText('Overdue')).toBeTruthy()
  })

  it('shows "Today" when watering is due today', () => {
    const todayWaterPlant = {
      ...basePlant,
      needsWater: false,
      daysUntilWater: 0,
    }

    render(<PlantCard plant={todayWaterPlant} onPress={mockOnPress} />)

    expect(screen.getByText('Today')).toBeTruthy()
  })

  it('shows "Tomorrow" when watering is due tomorrow', () => {
    const tomorrowWaterPlant = {
      ...basePlant,
      needsWater: false,
      daysUntilWater: 1,
    }

    render(<PlantCard plant={tomorrowWaterPlant} onPress={mockOnPress} />)

    expect(screen.getByText('Tomorrow')).toBeTruthy()
  })

  it('shows days count when watering is in future', () => {
    const futureWaterPlant = {
      ...basePlant,
      needsWater: false,
      daysUntilWater: 5,
    }

    render(<PlantCard plant={futureWaterPlant} onPress={mockOnPress} />)

    expect(screen.getByText('5 days')).toBeTruthy()
  })

  it('does not show water indicator when daysUntilWater is undefined', () => {
    render(<PlantCard plant={basePlant} onPress={mockOnPress} />)

    expect(screen.queryByText('Overdue')).toBeNull()
    expect(screen.queryByText('Today')).toBeNull()
    expect(screen.queryByText('Tomorrow')).toBeNull()
    expect(screen.queryByText(/days/)).toBeNull()
  })

  it('applies correct health styles for attention status', () => {
    const attentionPlant = {
      ...basePlant,
      health: 'attention' as const,
    }

    render(<PlantCard plant={attentionPlant} onPress={mockOnPress} />)

    expect(screen.getByTestId('health-dot')).toBeTruthy()
  })

  it('applies correct health styles for critical status', () => {
    const criticalPlant = {
      ...basePlant,
      health: 'critical' as const,
    }

    render(<PlantCard plant={criticalPlant} onPress={mockOnPress} />)

    expect(screen.getByTestId('health-dot')).toBeTruthy()
  })
})
