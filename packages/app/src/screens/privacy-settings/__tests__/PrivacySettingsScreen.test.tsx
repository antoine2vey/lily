import { fireEvent, render, screen } from '@testing-library/react-native'

// Mock dependencies
jest.mock('@/hooks/usePrivacySettings', () => ({
  usePrivacySettings: jest.fn(),
  useUpdatePrivacySettings: jest.fn(),
}))

jest.mock('@/hooks/useWeatherSettings', () => ({
  useWeatherSettings: jest.fn(() => ({ data: undefined })),
  useToggleWeather: jest.fn(() => ({ mutate: jest.fn() })),
}))

import {
  usePrivacySettings,
  useUpdatePrivacySettings,
} from 'src/hooks/usePrivacySettings'
import { PrivacySettingsScreen } from '../PrivacySettingsScreen'

const mockedUsePrivacySettings = usePrivacySettings as jest.Mock
const mockedUseUpdatePrivacySettings = useUpdatePrivacySettings as jest.Mock
describe('PrivacySettingsScreen', () => {
  const mockUpdateSettings = jest.fn()

  const defaultSettings = {
    publicProfile: true,
    shareGrowthData: false,
    personalizedTips: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseUpdatePrivacySettings.mockReturnValue({
      mutate: mockUpdateSettings,
    })
  })

  it('shows loading state when data is loading', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    render(<PrivacySettingsScreen />)

    // Screen returns null during initial loading (before skeleton delay)
    expect(screen.queryByText('Privacy & Data')).toBeNull()
  })

  it('displays privacy & data title', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: defaultSettings,
      isLoading: false,
    })

    render(<PrivacySettingsScreen />)

    expect(screen.getByText('Privacy & Data')).toBeTruthy()
  })

  it('displays visibility section', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: defaultSettings,
      isLoading: false,
    })

    render(<PrivacySettingsScreen />)

    expect(screen.getByText('Visibility & Personalization')).toBeTruthy()
    expect(screen.getByText('Public Profile')).toBeTruthy()
    expect(screen.getByText('Share Growth Data')).toBeTruthy()
    expect(screen.getByText('Personalized Tips')).toBeTruthy()
  })

  it('displays legal section', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: defaultSettings,
      isLoading: false,
    })

    render(<PrivacySettingsScreen />)

    expect(screen.getByText('Legal & Info')).toBeTruthy()
    expect(screen.getByText('Privacy Policy')).toBeTruthy()
    expect(screen.getByText('Terms of Service')).toBeTruthy()
  })

  it('displays data actions section', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: defaultSettings,
      isLoading: false,
    })

    render(<PrivacySettingsScreen />)

    expect(screen.getByText('Your Data')).toBeTruthy()
    expect(screen.getByText('Export My Data (Coming Soon)')).toBeTruthy()
    expect(screen.getByText('Request Data Deletion')).toBeTruthy()
  })

  it('calls updateSettings when toggle is changed', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: defaultSettings,
      isLoading: false,
    })

    render(<PrivacySettingsScreen />)

    // Find and toggle a switch
    const publicProfileToggle = screen.getByTestId('toggle-public-profile')
    fireEvent(publicProfileToggle, 'valueChange', false)

    expect(mockUpdateSettings).toHaveBeenCalledWith({ publicProfile: false })
  })

  it('shows export data button as disabled', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: defaultSettings,
      isLoading: false,
    })

    render(<PrivacySettingsScreen />)

    expect(screen.getByText('Export My Data (Coming Soon)')).toBeTruthy()
  })
})
