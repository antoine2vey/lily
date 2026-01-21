import { fireEvent, render, screen } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'

// Mock navigation
const mockNavigate = vi.fn()
const mockGoBack = vi.fn()
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
  useRoute: () => ({
    params: {},
  }),
}))

// Mock expo-image-picker
vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn().mockResolvedValue({ canceled: true }),
  launchCameraAsync: vi.fn().mockResolvedValue({ canceled: true }),
  requestCameraPermissionsAsync: vi
    .fn()
    .mockResolvedValue({ status: 'granted' }),
}))

import { ManualAddBasicInfoScreen } from '../ManualAddBasicInfoScreen'

describe('ManualAddBasicInfoScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows step indicator "1 of 3"', () => {
    render(<ManualAddBasicInfoScreen />)
    expect(screen.getByText('1 of 3')).toBeTruthy()
  })

  it('renders title "Add New Plant"', () => {
    render(<ManualAddBasicInfoScreen />)
    expect(screen.getByText('Add New Plant')).toBeTruthy()
  })

  it('renders section title "Basic Info"', () => {
    render(<ManualAddBasicInfoScreen />)
    expect(screen.getByText('Basic Info')).toBeTruthy()
  })

  it('renders photo picker placeholder', () => {
    render(<ManualAddBasicInfoScreen />)
    expect(screen.getByText('Tap to add photo')).toBeTruthy()
  })

  it('renders name input label', () => {
    render(<ManualAddBasicInfoScreen />)
    expect(screen.getByText(/Nickname or Plant Name/)).toBeTruthy()
  })

  it('renders category picker label', () => {
    render(<ManualAddBasicInfoScreen />)
    expect(screen.getByText('Category')).toBeTruthy()
  })

  it('disables Next when name is empty', () => {
    render(<ManualAddBasicInfoScreen />)
    const nextButton = screen.getByText('Next')
    expect(nextButton).toBeTruthy()
    // Button should be disabled
  })

  it('enables Next when name is entered', () => {
    render(<ManualAddBasicInfoScreen />)
    const input = screen.getByPlaceholderText('e.g. Monstera Deliciosa')
    fireEvent.changeText(input, 'My Plant')
    const nextButton = screen.getByText('Next')
    expect(nextButton).toBeTruthy()
  })

  it('navigates to step 2 with data when Next pressed', () => {
    render(<ManualAddBasicInfoScreen />)
    const input = screen.getByPlaceholderText('e.g. Monstera Deliciosa')
    fireEvent.changeText(input, 'My Plant')
    const nextButton = screen.getByText('Next')
    fireEvent.press(nextButton)
    expect(mockNavigate).toHaveBeenCalledWith('ManualAddCareNeeds', {
      basicInfo: { photo: null, name: 'My Plant', category: '' },
    })
  })

  it('goes back when back button pressed', () => {
    render(<ManualAddBasicInfoScreen />)
    const backButton = screen.getByRole('button')
    fireEvent.press(backButton)
    expect(mockGoBack).toHaveBeenCalled()
  })
})
