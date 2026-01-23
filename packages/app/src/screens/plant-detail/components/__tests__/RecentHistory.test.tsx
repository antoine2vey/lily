import { fireEvent, render, screen } from '@testing-library/react-native'
import { RecentHistory } from '../RecentHistory'

describe('RecentHistory', () => {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

  const mockEvents = [
    { id: 'event-1', type: 'watered' as const, date: now },
    { id: 'event-2', type: 'fertilized' as const, date: yesterday },
    { id: 'event-3', type: 'pruned' as const, date: threeDaysAgo },
    { id: 'event-4', type: 'misted' as const, date: threeDaysAgo },
  ]

  const defaultProps = {
    events: mockEvents,
    onViewAll: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders section header with View All', () => {
    render(<RecentHistory {...defaultProps} />)
    expect(screen.getByText('Recent History')).toBeTruthy()
    expect(screen.getByText('View All')).toBeTruthy()
  })

  it('renders up to 3 events', () => {
    render(<RecentHistory {...defaultProps} />)
    expect(screen.getByTestId('history-event-event-1')).toBeTruthy()
    expect(screen.getByTestId('history-event-event-2')).toBeTruthy()
    expect(screen.getByTestId('history-event-event-3')).toBeTruthy()
    expect(screen.queryByTestId('history-event-event-4')).toBeNull()
  })

  it('shows correct labels per event type', () => {
    render(<RecentHistory {...defaultProps} />)
    expect(screen.getByText('Watered')).toBeTruthy()
    expect(screen.getByText('Fertilized')).toBeTruthy()
    expect(screen.getByText('Pruned')).toBeTruthy()
  })

  it('formats date correctly', () => {
    render(<RecentHistory {...defaultProps} />)
    expect(screen.getByText('Just now')).toBeTruthy()
    expect(screen.getByText('Yesterday')).toBeTruthy()
    expect(screen.getByText('3 days ago')).toBeTruthy()
  })

  it('calls onViewAll when header action pressed', () => {
    render(<RecentHistory {...defaultProps} />)
    fireEvent.press(screen.getByText('View All'))
    expect(defaultProps.onViewAll).toHaveBeenCalledTimes(1)
  })

  it('shows no history message when events empty', () => {
    render(<RecentHistory events={[]} onViewAll={jest.fn()} />)
    expect(screen.getByTestId('no-history')).toBeTruthy()
    expect(screen.getByText('No care history yet')).toBeTruthy()
  })

  it('renders event notes when provided', () => {
    const eventsWithNotes = [
      {
        id: 'event-1',
        type: 'watered' as const,
        date: now,
        notes: 'Added fertilizer',
      },
    ]
    render(<RecentHistory events={eventsWithNotes} onViewAll={jest.fn()} />)
    expect(screen.getByText('Added fertilizer')).toBeTruthy()
  })
})
