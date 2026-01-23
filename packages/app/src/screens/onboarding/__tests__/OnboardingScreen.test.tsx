import { fireEvent, render, screen } from '@testing-library/react-native'

// Mock dependencies
jest.mock('@/hooks/useOnboardingComplete', () => ({
  useOnboardingComplete: jest.fn(),
}))

import { useOnboardingComplete } from '@/hooks/useOnboardingComplete'
import { OnboardingScreen } from '../OnboardingScreen'

const mockedUseOnboardingComplete =
  useOnboardingComplete as jest.MockedFunction<typeof useOnboardingComplete>

describe('OnboardingScreen', () => {
  const mockCompleteOnboarding = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseOnboardingComplete.mockReturnValue({
      completeOnboarding: mockCompleteOnboarding,
    })
  })

  it('displays skip button', () => {
    render(<OnboardingScreen />)

    expect(screen.getByText('Skip')).toBeTruthy()
  })

  it('displays first slide content', () => {
    render(<OnboardingScreen />)

    expect(screen.getByText('Track your plant family')).toBeTruthy()
    expect(
      screen.getByText('Keep all your plants organized in one beautiful place')
    ).toBeTruthy()
  })

  it('displays next button initially', () => {
    render(<OnboardingScreen />)

    expect(screen.getByText('Next')).toBeTruthy()
  })

  it('displays pagination dots', () => {
    render(<OnboardingScreen />)

    expect(screen.getByTestId('pagination-dots')).toBeTruthy()
  })

  it('calls completeOnboarding when skip is pressed', async () => {
    render(<OnboardingScreen />)

    fireEvent.press(screen.getByText('Skip'))

    expect(mockCompleteOnboarding).toHaveBeenCalled()
  })

  it('shows all 3 slides content', () => {
    render(<OnboardingScreen />)

    // All slide titles should be present (even if not visible)
    expect(screen.getByText('Track your plant family')).toBeTruthy()
    expect(screen.getByText('Never miss a watering')).toBeTruthy()
    expect(screen.getByText('Learn and grow together')).toBeTruthy()
  })

  it('displays slide descriptions', () => {
    render(<OnboardingScreen />)

    expect(
      screen.getByText('Keep all your plants organized in one beautiful place')
    ).toBeTruthy()
    expect(screen.getByText(/Smart reminders help you care/)).toBeTruthy()
    expect(
      screen.getByText(/Get personalized tips from our AI assistant/)
    ).toBeTruthy()
  })
})
