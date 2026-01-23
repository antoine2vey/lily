import { fireEvent, render, screen } from '@testing-library/react-native'
import { RecentHistory } from '../RecentHistory'

describe('RecentHistory', () => {
  const mockOnViewAll = jest.fn()

  const mockEvents = [
    { id: 'event-1', type: 'watered' as const, date: '2024-01-15T10:30:00Z' },
    {
      id: 'event-2',
      type: 'fertilized' as const,
      date: '2024-01-10T14:00:00Z',
      notes: 'Used organic fertilizer',
    },
    { id: 'event-3', type: 'pruned' as const, date: '2024-01-05T09:00:00Z' },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders recent history section', () => {
    render(<RecentHistory events={mockEvents} onViewAll={mockOnViewAll} />)

    expect(screen.getByTestId('recent-history')).toBeTruthy()
  })

  it('displays section header', () => {
    render(<RecentHistory events={mockEvents} onViewAll={mockOnViewAll} />)

    expect(screen.getByText('Recent History')).toBeTruthy()
  })

  it('shows view all link', () => {
    render(<RecentHistory events={mockEvents} onViewAll={mockOnViewAll} />)

    expect(screen.getByText('View All')).toBeTruthy()
  })

  it('displays event labels', () => {
    render(<RecentHistory events={mockEvents} onViewAll={mockOnViewAll} />)

    expect(screen.getByText('Watered')).toBeTruthy()
    expect(screen.getByText('Fertilized')).toBeTruthy()
    expect(screen.getByText('Pruned')).toBeTruthy()
  })

  it('displays event notes when provided', () => {
    render(<RecentHistory events={mockEvents} onViewAll={mockOnViewAll} />)

    expect(screen.getByText('Used organic fertilizer')).toBeTruthy()
  })

  it('shows empty state when no events', () => {
    render(<RecentHistory events={[]} onViewAll={mockOnViewAll} />)

    expect(screen.getByTestId('no-history')).toBeTruthy()
    expect(screen.getByText('No care history yet')).toBeTruthy()
  })

  it('limits to 3 events', () => {
    const manyEvents = [
      { id: 'event-1', type: 'watered' as const, date: '2024-01-15T10:30:00Z' },
      { id: 'event-2', type: 'watered' as const, date: '2024-01-14T10:30:00Z' },
      { id: 'event-3', type: 'watered' as const, date: '2024-01-13T10:30:00Z' },
      { id: 'event-4', type: 'watered' as const, date: '2024-01-12T10:30:00Z' },
    ]

    render(<RecentHistory events={manyEvents} onViewAll={mockOnViewAll} />)

    expect(screen.getByTestId('history-event-event-1')).toBeTruthy()
    expect(screen.getByTestId('history-event-event-2')).toBeTruthy()
    expect(screen.getByTestId('history-event-event-3')).toBeTruthy()
    expect(screen.queryByTestId('history-event-event-4')).toBeNull()
  })

  it('calls onViewAll when view all is pressed', () => {
    render(<RecentHistory events={mockEvents} onViewAll={mockOnViewAll} />)

    fireEvent.press(screen.getByText('View All'))

    expect(mockOnViewAll).toHaveBeenCalledTimes(1)
  })
})
