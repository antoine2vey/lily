import { fireEvent, render } from '@testing-library/react-native'
import { RecentActivity } from '../RecentActivity'

describe('RecentActivity', () => {
  const mockActivities = [
    {
      id: '1',
      type: 'watered' as const,
      plantName: 'Monstera',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      plantImageUrl: 'https://example.com/monstera.jpg',
    },
    {
      id: '2',
      type: 'fertilized' as const,
      plantName: 'Fern',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
    },
    {
      id: '3',
      type: 'added' as const,
      plantName: 'Snake Plant',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    },
  ]

  const defaultProps = {
    activities: mockActivities,
    onSeeAll: jest.fn(),
    onActivityPress: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders section header with "See All"', () => {
    const { getByText } = render(<RecentActivity {...defaultProps} />)
    expect(getByText('Recent Activity')).toBeTruthy()
    expect(getByText('See All')).toBeTruthy()
  })

  it('renders activity items', () => {
    const { getByText } = render(<RecentActivity {...defaultProps} />)
    expect(getByText('Monstera watered')).toBeTruthy()
    expect(getByText('Fern fertilized')).toBeTruthy()
    expect(getByText('New plant added: Snake Plant')).toBeTruthy()
  })

  it('shows relative time (2h ago)', () => {
    const { getByText } = render(<RecentActivity {...defaultProps} />)
    expect(getByText('2h ago')).toBeTruthy()
  })

  it('shows "Yesterday" for day-old activities', () => {
    const { getByText } = render(<RecentActivity {...defaultProps} />)
    expect(getByText('Yesterday')).toBeTruthy()
  })

  it('calls onSeeAll when header action pressed', () => {
    const onSeeAll = jest.fn()
    const { getByText } = render(
      <RecentActivity {...defaultProps} onSeeAll={onSeeAll} />
    )
    fireEvent.press(getByText('See All'))
    expect(onSeeAll).toHaveBeenCalledTimes(1)
  })

  it('calls onActivityPress when item pressed', () => {
    const onActivityPress = jest.fn()
    const { getByText } = render(
      <RecentActivity {...defaultProps} onActivityPress={onActivityPress} />
    )
    fireEvent.press(getByText('Monstera watered'))
    expect(onActivityPress).toHaveBeenCalledWith('1')
  })

  it('renders empty message when no activities', () => {
    const { getByText } = render(
      <RecentActivity {...defaultProps} activities={[]} />
    )
    expect(getByText(/No recent activity yet/)).toBeTruthy()
  })
})
