import { fireEvent, render, screen } from '@testing-library/react-native'
import { Timeline } from '../Timeline'

describe('Timeline', () => {
  const mockOnEventPress = jest.fn()

  const mockGroups = [
    {
      date: 'Today',
      events: [
        {
          id: 'event-1',
          type: 'watering' as const,
          createdAt: '2024-01-15T10:30:00Z',
        },
        {
          id: 'event-2',
          type: 'fertilization' as const,
          createdAt: '2024-01-15T09:00:00Z',
        },
      ],
    },
    {
      date: 'Yesterday',
      events: [
        {
          id: 'event-3',
          type: 'prune' as const,
          createdAt: '2024-01-14T14:00:00Z',
        },
      ],
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders date headers', () => {
    render(<Timeline groups={mockGroups} onEventPress={mockOnEventPress} />)

    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Yesterday')).toBeTruthy()
  })

  it('renders event cards', () => {
    render(<Timeline groups={mockGroups} onEventPress={mockOnEventPress} />)

    expect(screen.getByText('Watered')).toBeTruthy()
    expect(screen.getByText('Fertilized')).toBeTruthy()
    expect(screen.getByText('Pruned')).toBeTruthy()
  })

  it('calls onEventPress when event is pressed', () => {
    render(<Timeline groups={mockGroups} onEventPress={mockOnEventPress} />)

    fireEvent.press(screen.getByText('Watered'))

    expect(mockOnEventPress).toHaveBeenCalledWith(mockGroups[0]!.events[0])
  })

  it('renders multiple groups correctly', () => {
    render(<Timeline groups={mockGroups} onEventPress={mockOnEventPress} />)

    // Both groups should be rendered
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Yesterday')).toBeTruthy()
  })
})
