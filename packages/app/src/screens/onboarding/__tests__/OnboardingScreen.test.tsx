import { fireEvent, render, screen } from '@testing-library/react-native'

// Mock dependencies
jest.mock('@/hooks/useOnboardingFlow', () => ({
  useOnboardingFlow: jest.fn(),
}))

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    state: {
      _tag: 'Authenticated',
      user: { name: 'TestUser' },
      accessToken: 'token',
    },
  })),
}))

jest.mock('@/utils/client', () => ({
  apiEffectRunner: jest.fn(),
  useEffectQuery: jest.fn(() => ({ data: undefined })),
}))

jest.mock('@/hooks/useCreatePlant', () => ({
  useCreatePlant: jest.fn(() => ({
    mutateAsync: jest.fn(),
  })),
}))

jest.mock('@/hooks/useCreateRoom', () => ({
  useCreateRoom: jest.fn(() => ({
    mutateAsync: jest.fn(),
  })),
}))

import { useOnboardingFlow } from '@/hooks/useOnboardingFlow'
import { OnboardingFlowScreen } from '../OnboardingFlowScreen'

const mockedUseOnboardingFlow = useOnboardingFlow as jest.MockedFunction<
  typeof useOnboardingFlow
>

const defaultFlowReturn = {
  currentStep: 0,
  data: {},
  isLoading: false,
  totalSteps: 6,
  advance: jest.fn(),
  skipStep: jest.fn(),
  complete: jest.fn().mockResolvedValue({}),
  skipOnboarding: jest.fn().mockResolvedValue(undefined),
}

describe('OnboardingFlowScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseOnboardingFlow.mockReturnValue({ ...defaultFlowReturn })
  })

  it('displays welcome step with greeting', () => {
    render(<OnboardingFlowScreen />)

    expect(screen.getByText(/Welcome to Lily.*TestUser/)).toBeTruthy()
  })

  it('displays experience level options on welcome step', () => {
    render(<OnboardingFlowScreen />)

    expect(screen.getByText('Just starting out')).toBeTruthy()
    expect(screen.getByText('A few plants')).toBeTruthy()
    expect(screen.getByText('Plant parent pro')).toBeTruthy()
  })

  it('displays skip onboarding link on welcome step', () => {
    render(<OnboardingFlowScreen />)

    expect(screen.getByText('Skip onboarding')).toBeTruthy()
  })

  it('calls advance when experience level is selected', () => {
    const advance = jest.fn()
    mockedUseOnboardingFlow.mockReturnValue({
      ...defaultFlowReturn,
      advance,
    })

    render(<OnboardingFlowScreen />)

    fireEvent.press(screen.getByText('Just starting out'))

    expect(advance).toHaveBeenCalledWith({
      experienceLevel: 'beginner',
    })
  })

  it('calls skipOnboarding when skip link is pressed', () => {
    const skipOnboarding = jest.fn().mockResolvedValue(undefined)
    mockedUseOnboardingFlow.mockReturnValue({
      ...defaultFlowReturn,
      skipOnboarding,
    })

    render(<OnboardingFlowScreen />)

    fireEvent.press(screen.getByText('Skip onboarding'))

    expect(skipOnboarding).toHaveBeenCalled()
  })

  it('displays add plant step at step 1', () => {
    mockedUseOnboardingFlow.mockReturnValue({
      ...defaultFlowReturn,
      currentStep: 1,
    })

    render(<OnboardingFlowScreen />)

    expect(screen.getByText('Add your first plant')).toBeTruthy()
    expect(screen.getByText('Scan with camera')).toBeTruthy()
  })

  it('displays rooms step at step 2', () => {
    mockedUseOnboardingFlow.mockReturnValue({
      ...defaultFlowReturn,
      currentStep: 2,
    })

    render(<OnboardingFlowScreen />)

    expect(screen.getByText('Where are your plants?')).toBeTruthy()
    expect(screen.getByText('Living Room')).toBeTruthy()
    expect(screen.getByText('Balcony')).toBeTruthy()
  })

  it('displays notification step at step 3', () => {
    mockedUseOnboardingFlow.mockReturnValue({
      ...defaultFlowReturn,
      currentStep: 3,
    })

    render(<OnboardingFlowScreen />)

    expect(screen.getByText('Never miss a watering')).toBeTruthy()
    expect(screen.getByText('Enable Reminders')).toBeTruthy()
  })

  it('displays notification step with plant name when available', () => {
    mockedUseOnboardingFlow.mockReturnValue({
      ...defaultFlowReturn,
      currentStep: 3,
      data: { plantName: 'Monstera', plantDays: 5 },
    })

    render(<OnboardingFlowScreen />)

    expect(screen.getByText(/Monstera.*needs care every.*5.*days/)).toBeTruthy()
  })

  it('displays location step at step 4', () => {
    mockedUseOnboardingFlow.mockReturnValue({
      ...defaultFlowReturn,
      currentStep: 4,
    })

    render(<OnboardingFlowScreen />)

    expect(screen.getByText('Weather-aware care tips')).toBeTruthy()
    expect(screen.getByText('Enable Weather Tips')).toBeTruthy()
  })

  it('displays preferences step at step 5', () => {
    mockedUseOnboardingFlow.mockReturnValue({
      ...defaultFlowReturn,
      currentStep: 5,
    })

    render(<OnboardingFlowScreen />)

    expect(screen.getByText('When do you care for plants?')).toBeTruthy()
    expect(screen.getByText('Morning')).toBeTruthy()
    expect(screen.getByText('Afternoon')).toBeTruthy()
    expect(screen.getByText('Evening')).toBeTruthy()
  })

  it('displays completion step at step 6', () => {
    mockedUseOnboardingFlow.mockReturnValue({
      ...defaultFlowReturn,
      currentStep: 6,
      data: { notificationsEnabled: true, weatherEnabled: false },
    })

    render(<OnboardingFlowScreen />)

    expect(screen.getByText("You're all set!")).toBeTruthy()
    expect(screen.getByText('Enter Lily')).toBeTruthy()
  })
})
