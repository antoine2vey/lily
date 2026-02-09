import { fireEvent, render, screen } from '@testing-library/react-native'
import { mockUsers } from 'src/__tests__/fixtures/users'

// Mock dependencies
jest.mock('@/hooks/useUser', () => ({
  useUser: jest.fn(),
}))

jest.mock('@/hooks/useTheme', () => ({
  useTheme: jest.fn(),
}))

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    logout: jest.fn(),
    state: { _tag: 'Authenticated', user: { name: 'Test' } },
  })),
}))

import { useTheme } from 'src/hooks/useTheme'
import { useUser } from 'src/hooks/useUser'
import { SettingsScreen } from '../SettingsScreen'

const mockedUseUser = useUser as jest.Mock
const mockedUseTheme = useTheme as jest.Mock
describe('SettingsScreen', () => {
  const mockSetTheme = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseTheme.mockReturnValue({
      theme: 'system' as const,
      setTheme: mockSetTheme,
      isLoading: false,
    })
  })

  it('shows loading state when data is loading', () => {
    mockedUseUser.mockReturnValue({ data: undefined, isLoading: true })

    render(<SettingsScreen />)

    expect(screen.getByTestId('activity-indicator')).toBeTruthy()
  })

  it('displays settings title', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('displays appearance section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
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

    render(<SettingsScreen />)

    expect(screen.getByText('Notifications')).toBeTruthy()
    expect(screen.getByText('Push Notifications')).toBeTruthy()
  })

  it('displays privacy section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    render(<SettingsScreen />)

    // Multiple "Privacy" elements exist (section header and menu item)
    expect(screen.getAllByText('Privacy').length).toBeGreaterThan(0)
  })

  it('displays support section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Support')).toBeTruthy()
    expect(screen.getByText('Help Center')).toBeTruthy()
    expect(screen.getByText('Contact Us')).toBeTruthy()
    expect(screen.getByText('Version')).toBeTruthy()
  })

  it('displays account section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Account')).toBeTruthy()
    expect(screen.getByText('Sign Out')).toBeTruthy()
    expect(screen.getByText('Delete Account')).toBeTruthy()
  })

  it('shows delete account', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    render(<SettingsScreen />)

    expect(screen.getByText('Delete Account')).toBeTruthy()
  })

  it('displays version number', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    render(<SettingsScreen />)

    // Multiple "Version" elements may exist
    expect(screen.getAllByText(/Version/).length).toBeGreaterThan(0)
  })

  it('opens theme modal when theme is pressed', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    render(<SettingsScreen />)

    fireEvent.press(screen.getByText('Theme'))

    expect(screen.getByText('Light')).toBeTruthy()
    expect(screen.getByText('Dark')).toBeTruthy()
  })
})
