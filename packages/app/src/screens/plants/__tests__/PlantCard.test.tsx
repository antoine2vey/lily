import { fireEvent, render, screen } from '@testing-library/react-native'
import { PlantCard } from '../components/PlantCard'

describe('PlantCard', () => {
  const mockOnPress = jest.fn()

  const basePlant = {
    id: 'plant-1',
    name: 'Monstera Deliciosa',
    health: 'healthy' as const,
    watering: { daysUntil: undefined, isOverdue: false },
    fertilization: { daysUntil: undefined, isOverdue: false },
    misting: { daysUntil: undefined, isOverdue: false },
    repotting: { daysUntil: undefined, isOverdue: false },
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

  describe('watering indicators', () => {
    it('shows "Overdue" when watering is overdue', () => {
      const overdueWaterPlant = {
        ...basePlant,
        watering: { daysUntil: 0, isOverdue: true },
      }

      render(<PlantCard plant={overdueWaterPlant} onPress={mockOnPress} />)

      expect(screen.getByText('Overdue')).toBeTruthy()
    })

    it('shows "Today" when watering is due today', () => {
      const todayWaterPlant = {
        ...basePlant,
        watering: { daysUntil: 0, isOverdue: false },
      }

      render(<PlantCard plant={todayWaterPlant} onPress={mockOnPress} />)

      expect(screen.getByText('Today')).toBeTruthy()
    })

    it('shows "Tomorrow" when watering is due tomorrow', () => {
      const tomorrowWaterPlant = {
        ...basePlant,
        watering: { daysUntil: 1, isOverdue: false },
      }

      render(<PlantCard plant={tomorrowWaterPlant} onPress={mockOnPress} />)

      expect(screen.getByText('Tomorrow')).toBeTruthy()
    })

    it('shows days count when watering is in future', () => {
      const futureWaterPlant = {
        ...basePlant,
        watering: { daysUntil: 5, isOverdue: false },
      }

      render(<PlantCard plant={futureWaterPlant} onPress={mockOnPress} />)

      expect(screen.getByText('5 days')).toBeTruthy()
    })
  })

  describe('fertilization indicators', () => {
    it('shows "Overdue" when fertilization is overdue', () => {
      const overdueFertilizePlant = {
        ...basePlant,
        fertilization: { daysUntil: 0, isOverdue: true },
      }

      render(<PlantCard plant={overdueFertilizePlant} onPress={mockOnPress} />)

      expect(screen.getByText('Overdue')).toBeTruthy()
    })

    it('shows "Today" when fertilization is due today', () => {
      const todayFertilizePlant = {
        ...basePlant,
        fertilization: { daysUntil: 0, isOverdue: false },
      }

      render(<PlantCard plant={todayFertilizePlant} onPress={mockOnPress} />)

      expect(screen.getByText('Today')).toBeTruthy()
    })

    it('shows days count when fertilization is in future', () => {
      const futureFertilizePlant = {
        ...basePlant,
        fertilization: { daysUntil: 3, isOverdue: false },
      }

      render(<PlantCard plant={futureFertilizePlant} onPress={mockOnPress} />)

      expect(screen.getByText('3 days')).toBeTruthy()
    })
  })

  describe('14-day filter', () => {
    it('hides indicators beyond 14 days', () => {
      const farFuturePlant = {
        ...basePlant,
        watering: { daysUntil: 20, isOverdue: false },
        fertilization: { daysUntil: 30, isOverdue: false },
      }

      render(<PlantCard plant={farFuturePlant} onPress={mockOnPress} />)

      expect(screen.queryByText(/days/)).toBeNull()
    })

    it('shows indicators at exactly 14 days', () => {
      const boundaryPlant = {
        ...basePlant,
        watering: { daysUntil: 14, isOverdue: false },
      }

      render(<PlantCard plant={boundaryPlant} onPress={mockOnPress} />)

      expect(screen.getByText('14 days')).toBeTruthy()
    })

    it('always shows overdue indicators regardless of days value', () => {
      const overduePlant = {
        ...basePlant,
        watering: { daysUntil: 0, isOverdue: true },
      }

      render(<PlantCard plant={overduePlant} onPress={mockOnPress} />)

      expect(screen.getByText('Overdue')).toBeTruthy()
    })
  })

  describe('combined care indicators', () => {
    it('shows all indicators within 14 days', () => {
      const multipleCare = {
        ...basePlant,
        watering: { daysUntil: 2, isOverdue: false },
        fertilization: { daysUntil: 5, isOverdue: false },
      }

      render(<PlantCard plant={multipleCare} onPress={mockOnPress} />)

      expect(screen.getByText('2 days')).toBeTruthy()
      expect(screen.getByText('5 days')).toBeTruthy()
    })

    it('shows both overdue indicators when both are overdue', () => {
      const bothOverduePlant = {
        ...basePlant,
        watering: { daysUntil: 0, isOverdue: true },
        fertilization: { daysUntil: 0, isOverdue: true },
      }

      render(<PlantCard plant={bothOverduePlant} onPress={mockOnPress} />)

      expect(screen.getAllByText('Overdue')).toHaveLength(2)
    })

    it('shows overdue and upcoming together', () => {
      const mixedPlant = {
        ...basePlant,
        watering: { daysUntil: 0, isOverdue: true },
        fertilization: { daysUntil: 5, isOverdue: false },
      }

      render(<PlantCard plant={mixedPlant} onPress={mockOnPress} />)

      expect(screen.getByText('Overdue')).toBeTruthy()
      expect(screen.getByText('5 days')).toBeTruthy()
    })

    it('shows both today indicators when both are due today', () => {
      const bothTodayPlant = {
        ...basePlant,
        watering: { daysUntil: 0, isOverdue: false },
        fertilization: { daysUntil: 0, isOverdue: false },
      }

      render(<PlantCard plant={bothTodayPlant} onPress={mockOnPress} />)

      expect(screen.getAllByText('Today')).toHaveLength(2)
    })
  })

  it('does not show care indicator when no schedules are set', () => {
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

  it('shows favorite indicator when plant is favorite', () => {
    const favoritePlant = {
      ...basePlant,
      isFavorite: true,
    }

    render(<PlantCard plant={favoritePlant} onPress={mockOnPress} />)

    expect(screen.getByTestId('favorite-indicator')).toBeTruthy()
  })

  it('does not show favorite indicator when plant is not favorite', () => {
    render(<PlantCard plant={basePlant} onPress={mockOnPress} />)

    expect(screen.queryByTestId('favorite-indicator')).toBeNull()
  })
})
