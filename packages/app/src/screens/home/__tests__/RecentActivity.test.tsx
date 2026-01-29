import { fireEvent, render, screen } from '@testing-library/react-native'
import { mockDateAgo, mockNow } from 'src/__tests__/utils/dates'
import { RecentActivity } from '../components/RecentActivity'

describe('RecentActivity', () => {
  const mockActivities = [
    {
      id: '1',
      type: 'watered' as const,
      plantId: 'plant-1',
      plantName: 'Monstera',
      timestamp: mockDateAgo(2, 'hours'), // 2 hours ago
    },
    {
      id: '2',
      type: 'fertilized' as const,
      plantId: 'plant-2',
      plantName: 'Fern',
      timestamp: mockDateAgo(1, 'days'), // Yesterday
    },
    {
      id: '3',
      type: 'added' as const,
      plantId: 'plant-3',
      plantName: 'Cactus',
      timestamp: mockDateAgo(2, 'days'), // 2 days ago
    },
  ]

  const mockOnSeeAll = jest.fn()
  const mockOnActivityPress = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows empty state when no activities', () => {
    render(
      <RecentActivity
        activities={[]}
        onSeeAll={mockOnSeeAll}
        onActivityPress={mockOnActivityPress}
      />
    )

    expect(screen.getByText('Recent Activity')).toBeTruthy()
    expect(screen.getByText(/No recent activity yet/)).toBeTruthy()
  })

  it('displays activity list with title', () => {
    render(
      <RecentActivity
        activities={mockActivities}
        onSeeAll={mockOnSeeAll}
        onActivityPress={mockOnActivityPress}
      />
    )

    expect(screen.getByText('Recent Activity')).toBeTruthy()
    expect(screen.getByText('See All')).toBeTruthy()
  })

  it('formats watered activity correctly', () => {
    render(
      <RecentActivity
        activities={[mockActivities[0]]}
        onSeeAll={mockOnSeeAll}
        onActivityPress={mockOnActivityPress}
      />
    )

    expect(screen.getByText('Monstera watered')).toBeTruthy()
  })

  it('formats fertilized activity correctly', () => {
    render(
      <RecentActivity
        activities={[mockActivities[1]]}
        onSeeAll={mockOnSeeAll}
        onActivityPress={mockOnActivityPress}
      />
    )

    expect(screen.getByText('Fern fertilized')).toBeTruthy()
  })

  it('formats added activity correctly', () => {
    render(
      <RecentActivity
        activities={[mockActivities[2]]}
        onSeeAll={mockOnSeeAll}
        onActivityPress={mockOnActivityPress}
      />
    )

    expect(screen.getByText('New plant added: Cactus')).toBeTruthy()
  })

  it('formats misted activity correctly', () => {
    const mistedActivity = {
      id: '4',
      type: 'misted' as const,
      plantId: 'plant-4',
      plantName: 'Palm',
      timestamp: mockNow(),
    }

    render(
      <RecentActivity
        activities={[mistedActivity]}
        onSeeAll={mockOnSeeAll}
        onActivityPress={mockOnActivityPress}
      />
    )

    expect(screen.getByText('Palm misted')).toBeTruthy()
  })

  it('formats moved activity correctly', () => {
    const movedActivity = {
      id: '5',
      type: 'moved' as const,
      plantId: 'plant-5',
      plantName: 'Aloe',
      timestamp: mockNow(),
    }

    render(
      <RecentActivity
        activities={[movedActivity]}
        onSeeAll={mockOnSeeAll}
        onActivityPress={mockOnActivityPress}
      />
    )

    expect(screen.getByText('Moved Aloe to light')).toBeTruthy()
  })

  it('formats pruned activity correctly', () => {
    const prunedActivity = {
      id: '6',
      type: 'pruned' as const,
      plantId: 'plant-6',
      plantName: 'Rose',
      timestamp: mockNow(),
    }

    render(
      <RecentActivity
        activities={[prunedActivity]}
        onSeeAll={mockOnSeeAll}
        onActivityPress={mockOnActivityPress}
      />
    )

    expect(screen.getByText('Rose pruned')).toBeTruthy()
  })

  it('calls onSeeAll when See All is pressed', () => {
    render(
      <RecentActivity
        activities={mockActivities}
        onSeeAll={mockOnSeeAll}
        onActivityPress={mockOnActivityPress}
      />
    )

    fireEvent.press(screen.getByText('See All'))

    expect(mockOnSeeAll).toHaveBeenCalled()
  })

  it('calls onActivityPress when activity is pressed', () => {
    render(
      <RecentActivity
        activities={mockActivities}
        onSeeAll={mockOnSeeAll}
        onActivityPress={mockOnActivityPress}
      />
    )

    fireEvent.press(screen.getByText('Monstera watered'))

    expect(mockOnActivityPress).toHaveBeenCalledWith('1')
  })
})
