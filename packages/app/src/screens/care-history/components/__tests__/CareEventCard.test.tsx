import { fireEvent, render, screen } from '@testing-library/react-native'
import { CareEventCard } from '../CareEventCard'

describe('CareEventCard', () => {
  const mockOnPress = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders water event', () => {
    render(
      <CareEventCard
        event={{
          id: 'event-1',
          type: 'water',
          createdAt: '2024-01-15T10:30:00Z',
        }}
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('Watered')).toBeTruthy()
  })

  it('renders fertilize event', () => {
    render(
      <CareEventCard
        event={{
          id: 'event-1',
          type: 'fertilize',
          createdAt: '2024-01-15T10:30:00Z',
        }}
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('Fertilized')).toBeTruthy()
  })

  it('renders prune event', () => {
    render(
      <CareEventCard
        event={{
          id: 'event-1',
          type: 'prune',
          createdAt: '2024-01-15T10:30:00Z',
        }}
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('Pruned')).toBeTruthy()
  })

  it('renders notes when provided', () => {
    render(
      <CareEventCard
        event={{
          id: 'event-1',
          type: 'water',
          notes: 'Used filtered water',
          createdAt: '2024-01-15T10:30:00Z',
        }}
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('Used filtered water')).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    render(
      <CareEventCard
        event={{
          id: 'event-1',
          type: 'water',
          createdAt: '2024-01-15T10:30:00Z',
        }}
        onPress={mockOnPress}
      />
    )

    fireEvent.press(screen.getByText('Watered'))

    expect(mockOnPress).toHaveBeenCalledTimes(1)
  })
})
