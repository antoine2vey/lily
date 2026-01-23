import { fireEvent, render, screen } from '@testing-library/react-native'

// Mock dependencies
jest.mock('@/hooks/usePrivacySettings', () => ({
  usePrivacySettings: jest.fn(),
  useUpdatePrivacySettings: jest.fn(),
}))

jest.mock('@/hooks/useExportData', () => ({
  useExportData: jest.fn(),
}))

import { useExportData } from '@/hooks/useExportData'
import {
  usePrivacySettings,
  useUpdatePrivacySettings,
} from '@/hooks/usePrivacySettings'
import { PrivacySettingsScreen } from '../PrivacySettingsScreen'

const mockedUsePrivacySettings = usePrivacySettings as jest.MockedFunction<
  typeof usePrivacySettings
>
const mockedUseUpdatePrivacySettings =
  useUpdatePrivacySettings as jest.MockedFunction<
    typeof useUpdatePrivacySettings
  >
const mockedUseExportData = useExportData as jest.MockedFunction<
  typeof useExportData
>

describe('PrivacySettingsScreen', () => {
  const mockUpdateSettings = jest.fn()
  const mockExportData = jest.fn()

  const defaultSettings = {
    publicProfile: true,
    shareGrowthData: false,
    personalizedTips: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseUpdatePrivacySettings.mockReturnValue({
      mutate: mockUpdateSettings,
    } as any)
    mockedUseExportData.mockReturnValue({
      mutate: mockExportData,
      isPending: false,
    } as any)
  })

  it('shows loading state when data is loading', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any)

    render(<PrivacySettingsScreen />)

    expect(screen.getByTestId('activity-indicator')).toBeTruthy()
  })

  it('displays privacy & data title', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: defaultSettings,
      isLoading: false,
    } as any)

    render(<PrivacySettingsScreen />)

    expect(screen.getByText('Privacy & Data')).toBeTruthy()
  })

  it('displays visibility section', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: defaultSettings,
      isLoading: false,
    } as any)

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
    } as any)

    render(<PrivacySettingsScreen />)

    expect(screen.getByText('Legal & Info')).toBeTruthy()
    expect(screen.getByText('Privacy Policy')).toBeTruthy()
    expect(screen.getByText('Terms of Service')).toBeTruthy()
  })

  it('displays data actions section', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: defaultSettings,
      isLoading: false,
    } as any)

    render(<PrivacySettingsScreen />)

    expect(screen.getByText('Your Data')).toBeTruthy()
    expect(screen.getByText('Export My Data')).toBeTruthy()
    expect(screen.getByText('Request Data Deletion')).toBeTruthy()
  })

  it('calls updateSettings when toggle is changed', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: defaultSettings,
      isLoading: false,
    } as any)

    render(<PrivacySettingsScreen />)

    // Find and toggle a switch
    const publicProfileToggle = screen.getByTestId('toggle-public-profile')
    fireEvent(publicProfileToggle, 'valueChange', false)

    expect(mockUpdateSettings).toHaveBeenCalledWith({ publicProfile: false })
  })

  it('calls exportData when export button is pressed', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: defaultSettings,
      isLoading: false,
    } as any)

    render(<PrivacySettingsScreen />)

    fireEvent.press(screen.getByText('Export My Data'))

    expect(mockExportData).toHaveBeenCalled()
  })

  it('shows requesting text when exporting', () => {
    mockedUsePrivacySettings.mockReturnValue({
      data: defaultSettings,
      isLoading: false,
    } as any)

    mockedUseExportData.mockReturnValue({
      mutate: mockExportData,
      isPending: true,
    } as any)

    render(<PrivacySettingsScreen />)

    expect(screen.getByText('Requesting...')).toBeTruthy()
  })
})
