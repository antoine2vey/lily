import { render, screen } from '@testing-library/react-native'
import { mockUserAchievements } from 'src/__tests__/fixtures/achievements'
import { mockPlants } from 'src/__tests__/fixtures/plants'
import { mockUsers } from 'src/__tests__/fixtures/users'

// Mock dependencies
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('@/hooks/useUser', () => ({
  useUser: jest.fn(),
}))

jest.mock('@/hooks/usePlants', () => ({
  usePlants: jest.fn(),
}))

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: jest.fn(),
}))

jest.mock('@/hooks/useAchievements', () => ({
  useAchievements: jest.fn(),
}))

jest.mock('@/hooks/useSocialStats', () => ({
  useSocialStats: jest.fn(),
}))

jest.mock('@/hooks/useMyDelegations', () => ({
  useMyDelegations: jest.fn(),
}))

import { useAuth } from 'src/contexts/AuthContext'
import { useAchievements } from 'src/hooks/useAchievements'
import { useMyDelegations } from 'src/hooks/useMyDelegations'
import { usePlants } from 'src/hooks/usePlants'
import { useSocialStats } from 'src/hooks/useSocialStats'
import { useSubscription } from 'src/hooks/useSubscription'
import { useUser } from 'src/hooks/useUser'
import { ProfileScreen } from '../ProfileScreen'

const mockedUseAuth = useAuth as jest.Mock
const mockedUseUser = useUser as jest.Mock
const mockedUsePlants = usePlants as jest.Mock
const mockedUseSubscription = useSubscription as jest.Mock
const mockedUseAchievements = useAchievements as jest.Mock
const mockedUseSocialStats = useSocialStats as jest.Mock
const mockedUseMyDelegations = useMyDelegations as jest.Mock

describe('ProfileScreen', () => {
  const mockLogout = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      logout: mockLogout,
    })
    mockedUseSocialStats.mockReturnValue({
      followerCount: 0,
      followingCount: 0,
    })
    mockedUseMyDelegations.mockReturnValue({
      data: undefined,
    })
  })

  const mockSubscriptionInfo = {
    subscription: null,
    usage: null,
    tierConfig: {
      tier: 'free' as const,
      name: 'Free',
      priceMonthly: 0,
      maxPlants: 3,
      maxAiChatsMonthly: 10,
      maxCardScansMonthly: 5,
      maxPlantIdentifiesMonthly: 5,
    },
  }

  it('renders loading state', () => {
    mockedUseUser.mockReturnValue({ data: undefined, isLoading: true })
    mockedUsePlants.mockReturnValue({ data: undefined, isLoading: true })
    mockedUseSubscription.mockReturnValue({
      data: undefined,
      isLoading: true,
    })
    mockedUseAchievements.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    const { toJSON } = render(<ProfileScreen />)
    expect(toJSON()).toBeTruthy()
  })

  it('displays profile title', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUsePlants.mockReturnValue({
      data: { items: mockPlants, total: mockPlants.length },
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: mockSubscriptionInfo,
      isLoading: false,
    })
    mockedUseAchievements.mockReturnValue({
      data: { items: mockUserAchievements, unlockedCount: 2, totalCount: 10 },
      isLoading: false,
    })

    render(<ProfileScreen />)

    expect(screen.getByText('Profile')).toBeTruthy()
  })

  it('displays user name', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUsePlants.mockReturnValue({
      data: { items: mockPlants, total: mockPlants.length },
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: mockSubscriptionInfo,
      isLoading: false,
    })
    mockedUseAchievements.mockReturnValue({
      data: { items: mockUserAchievements, unlockedCount: 2, totalCount: 10 },
      isLoading: false,
    })

    render(<ProfileScreen />)

    expect(screen.getByText(mockUsers[0].name ?? 'User')).toBeTruthy()
  })

  it('shows menu items', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUsePlants.mockReturnValue({
      data: { items: mockPlants, total: mockPlants.length },
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: mockSubscriptionInfo,
      isLoading: false,
    })
    mockedUseAchievements.mockReturnValue({
      data: { items: mockUserAchievements, unlockedCount: 2, totalCount: 10 },
      isLoading: false,
    })

    render(<ProfileScreen />)

    expect(screen.getByText('Settings')).toBeTruthy()
    expect(screen.getByText('About')).toBeTruthy()
  })
})
