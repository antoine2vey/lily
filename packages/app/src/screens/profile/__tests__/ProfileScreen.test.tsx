import { mockUserAchievements } from '@lily/api/__tests__/fixtures/achievements'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { render, screen } from '@testing-library/react-native'

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

import { useAuth } from '@/contexts/AuthContext'
import { useAchievements } from '@/hooks/useAchievements'
import { usePlants } from '@/hooks/usePlants'
import { useSubscription } from '@/hooks/useSubscription'
import { useUser } from '@/hooks/useUser'
import { ProfileScreen } from '../ProfileScreen'

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockedUseUser = useUser as jest.MockedFunction<typeof useUser>
const mockedUsePlants = usePlants as jest.MockedFunction<typeof usePlants>
const mockedUseSubscription = useSubscription as jest.MockedFunction<
  typeof useSubscription
>
const mockedUseAchievements = useAchievements as jest.MockedFunction<
  typeof useAchievements
>

describe('ProfileScreen', () => {
  const mockLogout = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      logout: mockLogout,
    } as any)
  })

  it('renders loading state', () => {
    mockedUseUser.mockReturnValue({ data: undefined, isLoading: true } as any)
    mockedUsePlants.mockReturnValue({ data: undefined, isLoading: true } as any)
    mockedUseSubscription.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any)
    mockedUseAchievements.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any)

    const { toJSON } = render(<ProfileScreen />)
    expect(toJSON()).toBeTruthy()
  })

  it('displays profile title', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    } as any)
    mockedUsePlants.mockReturnValue({
      data: { items: mockPlants, total: mockPlants.length },
      isLoading: false,
    } as any)
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'free' },
      isLoading: false,
    } as any)
    mockedUseAchievements.mockReturnValue({
      data: { items: mockUserAchievements, unlockedCount: 2, totalCount: 10 },
      isLoading: false,
    } as any)

    render(<ProfileScreen />)

    expect(screen.getByText('Profile')).toBeTruthy()
  })

  it('displays user name', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    } as any)
    mockedUsePlants.mockReturnValue({
      data: { items: mockPlants, total: mockPlants.length },
      isLoading: false,
    } as any)
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'free' },
      isLoading: false,
    } as any)
    mockedUseAchievements.mockReturnValue({
      data: { items: mockUserAchievements, unlockedCount: 2, totalCount: 10 },
      isLoading: false,
    } as any)

    render(<ProfileScreen />)

    expect(screen.getByText(mockUsers[0].name ?? 'User')).toBeTruthy()
  })

  it('shows menu items', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    } as any)
    mockedUsePlants.mockReturnValue({
      data: { items: mockPlants, total: mockPlants.length },
      isLoading: false,
    } as any)
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'free' },
      isLoading: false,
    } as any)
    mockedUseAchievements.mockReturnValue({
      data: { items: mockUserAchievements, unlockedCount: 2, totalCount: 10 },
      isLoading: false,
    } as any)

    render(<ProfileScreen />)

    expect(screen.getByText('Settings')).toBeTruthy()
    expect(screen.getByText('About')).toBeTruthy()
  })
})
