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
    params: {
      basicInfo: { photo: null, name: 'Test Plant', category: 'indoor' },
    },
  }),
}))

import { ManualAddCareNeedsScreen } from '../ManualAddCareNeedsScreen'

describe('ManualAddCareNeedsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows step indicator "2 of 3"', () => {
    render(<ManualAddCareNeedsScreen />)
    expect(screen.getByText('2 of 3')).toBeTruthy()
  })

  it('renders title "Care Needs"', () => {
    render(<ManualAddCareNeedsScreen />)
    expect(screen.getByText('Care Needs')).toBeTruthy()
  })

  it('renders watering slider', () => {
    render(<ManualAddCareNeedsScreen />)
    expect(screen.getByText('Watering')).toBeTruthy()
  })

  it('renders light slider', () => {
    render(<ManualAddCareNeedsScreen />)
    expect(screen.getByText('Light')).toBeTruthy()
  })

  it('renders humidity slider', () => {
    render(<ManualAddCareNeedsScreen />)
    expect(screen.getByText('Humidity')).toBeTruthy()
  })

  it('renders pet safety toggle', () => {
    render(<ManualAddCareNeedsScreen />)
    expect(screen.getByText('Pet Safe')).toBeTruthy()
  })

  it('renders Back button', () => {
    render(<ManualAddCareNeedsScreen />)
    expect(screen.getByText('Back')).toBeTruthy()
  })

  it('renders Next Step button', () => {
    render(<ManualAddCareNeedsScreen />)
    expect(screen.getByText('Next Step')).toBeTruthy()
  })

  it('can go back to step 1', () => {
    render(<ManualAddCareNeedsScreen />)
    const backButton = screen.getByText('Back')
    fireEvent.press(backButton)
    expect(mockGoBack).toHaveBeenCalled()
  })

  it('navigates to step 3 with all data', () => {
    render(<ManualAddCareNeedsScreen />)
    const nextButton = screen.getByText('Next Step')
    fireEvent.press(nextButton)
    expect(mockNavigate).toHaveBeenCalledWith('ManualAddSchedule', {
      basicInfo: { photo: null, name: 'Test Plant', category: 'indoor' },
      careNeeds: { watering: 50, light: 50, humidity: 50, petSafe: false },
    })
  })
})
