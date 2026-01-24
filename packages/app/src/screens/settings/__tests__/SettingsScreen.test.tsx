import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { fireEvent, render, screen } from '@testing-library/react-native'

// Mock dependencies
jest.mock('@/hooks/useUser', () => ({
  useUser: jest.fn(),
}))

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: jest.fn(),
}))

jest.mock('@/hooks/useTheme', () => ({
  useTheme: jest.fn(),
}))

jest.mock('@/hooks/useDeleteAccount', () => ({
  useDeleteAccount: jest.fn(),
}))

import { useDeleteAccount } from '@/hooks/useDeleteAccount'
import { useSubscription } from '@/hooks/useSubscription'
import { useTheme } from '@/hooks/useTheme'
import { useUser } from '@/hooks/useUser'
import { SettingsScreen } from '../SettingsScreen'

const mockedUseUser = useUser as jest.MockedFunction<typeof useUser>
const mockedUseSubscription = useSubscription as jest.MockedFunction<
  typeof useSubscription
>
const mockedUseTheme = useTheme as jest.MockedFunction<typeof useTheme>
const mockedUseDeleteAccount = useDeleteAccount as jest.MockedFunction<
  typeof useDeleteAccount
>

describe('SettingsScreen', () => {
  const mockSetTheme = jest.fn()
  const mockDeleteAccount = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseTheme.mockReturnValue({
      theme: 'system' as const,
      setTheme: mockSetTheme,
      isLoading: false,
    })
    mockedUseDeleteAccount.mockReturnValue({
      mutate: mockDeleteAccount,
      isPending: false,
    })
  })

  it('shows loading state when data is loading', () => {
    mockedUseUser.mockReturnValue({ data: undefined, isLoading: true })
    mockedUseSubscription.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    render(<SettingsScreen />)

    expect(screen.getByTestId('activity-indicator')).toBeTruthy()
  })

  it('displays settings title', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'free', status: 'active' },
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('displays account section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'free', status: 'active' },
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Account')).toBeTruthy()
    expect(screen.getByText('Email')).toBeTruthy()
    expect(screen.getByText('Password')).toBeTruthy()
    expect(screen.getByText('Subscription')).toBeTruthy()
  })

  it('displays appearance section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'free', status: 'active' },
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Appearance')).toBeTruthy()
    expect(screen.getByText('Theme')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
  })

  it('displays notifications section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'free', status: 'active' },
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Notifications')).toBeTruthy()
    expect(screen.getByText('Notification Settings')).toBeTruthy()
  })

  it('displays privacy section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'free', status: 'active' },
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Privacy')).toBeTruthy()
    expect(screen.getByText('Privacy Settings')).toBeTruthy()
  })

  it('displays support section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'free', status: 'active' },
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Support')).toBeTruthy()
    expect(screen.getByText('Help Center')).toBeTruthy()
    expect(screen.getByText('Contact Us')).toBeTruthy()
    expect(screen.getByText('About Lily')).toBeTruthy()
  })

  it('displays account actions section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'free', status: 'active' },
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Account Actions')).toBeTruthy()
    expect(screen.getByText('Sign Out')).toBeTruthy()
    expect(screen.getByText('Delete Account')).toBeTruthy()
  })

  it('shows delete confirmation modal when delete account is pressed', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'free', status: 'active' },
      isLoading: false,
    })

    render(<SettingsScreen />)

    fireEvent.press(screen.getByText('Delete Account'))

    expect(screen.getByText('Delete Account?')).toBeTruthy()
    expect(screen.getByText(/This will permanently delete/)).toBeTruthy()
  })

  it('displays premium badge for premium users', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'premium', status: 'active' },
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Premium')).toBeTruthy()
  })

  it('displays trial badge for trialing users', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'premium', status: 'trialing' },
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Trial')).toBeTruthy()
  })

  it('displays version number', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'free', status: 'active' },
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Version 1.0.0')).toBeTruthy()
  })

  it('opens theme modal when theme is pressed', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })
    mockedUseSubscription.mockReturnValue({
      data: { plan: 'free', status: 'active' },
      isLoading: false,
    })

    render(<SettingsScreen />)

    fireEvent.press(screen.getByText('Theme'))

    expect(screen.getByText('Light')).toBeTruthy()
    expect(screen.getByText('Dark')).toBeTruthy()
  })
})
