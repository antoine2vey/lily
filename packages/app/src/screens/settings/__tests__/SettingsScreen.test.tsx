import { mockUsers } from '@/__tests__/fixtures/users'
import { fireEvent, renderWithQuery, screen } from '@/__tests__/utils/render'

jest.mock('@/utils/client', () => ({
  apiEffectRunner: jest.fn(),
}))

// Mock dependencies
jest.mock('@/hooks/useVacation', () => ({
  useVacation: jest.fn(() => ({
    data: { status: 'none', startDate: null, endDate: null },
    isLoading: false,
  })),
}))

jest.mock('@/hooks/useMyCanopy', () => ({
  useMyCanopy: jest.fn(() => ({ data: { canopy: null } })),
}))

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

import { useTheme } from '@/hooks/useTheme'
import { useUser } from '@/hooks/useUser'
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

    renderWithQuery(<SettingsScreen />)

    // Screen returns null during initial loading (before skeleton delay)
    expect(screen.queryByText('Settings')).toBeNull()
  })

  it('displays settings title', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    renderWithQuery(<SettingsScreen />)

    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('displays appearance section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    renderWithQuery(<SettingsScreen />)

    expect(screen.getByText('Appearance')).toBeTruthy()
    expect(screen.getByText('Theme')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
  })

  it('displays notifications section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    renderWithQuery(<SettingsScreen />)

    expect(screen.getByText('Notifications')).toBeTruthy()
    expect(screen.getByText('Push Notifications')).toBeTruthy()
  })

  it('displays privacy section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    renderWithQuery(<SettingsScreen />)

    // Multiple "Privacy" elements exist (section header and menu item)
    expect(screen.getAllByText('Privacy').length).toBeGreaterThan(0)
  })

  it('displays support section', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    renderWithQuery(<SettingsScreen />)

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

    renderWithQuery(<SettingsScreen />)

    expect(screen.getByText('Account')).toBeTruthy()
    expect(screen.getByText('Sign Out')).toBeTruthy()
    expect(screen.getByText('Delete Account')).toBeTruthy()
  })

  it('shows delete account', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    renderWithQuery(<SettingsScreen />)

    expect(screen.getByText('Delete Account')).toBeTruthy()
  })

  it('displays version number', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    renderWithQuery(<SettingsScreen />)

    // Multiple "Version" elements may exist
    expect(screen.getAllByText(/Version/).length).toBeGreaterThan(0)
  })

  it('opens theme modal when theme is pressed', () => {
    mockedUseUser.mockReturnValue({
      data: mockUsers[0],
      isLoading: false,
    })

    renderWithQuery(<SettingsScreen />)

    fireEvent.press(screen.getByText('Theme'))

    expect(screen.getByText('Light')).toBeTruthy()
    expect(screen.getByText('Dark')).toBeTruthy()
  })
})
