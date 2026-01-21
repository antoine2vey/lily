import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'

// Mock navigation
const mockNavigate = vi.fn()
const mockGoBack = vi.fn()
const mockReset = vi.fn()
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    reset: mockReset,
  }),
  useRoute: () => ({
    params: {
      basicInfo: { photo: null, name: 'Test Plant', category: 'indoor' },
      careNeeds: { watering: 50, light: 50, humidity: 50, petSafe: false },
    },
  }),
}))

import { ManualAddScheduleScreen } from '../ManualAddScheduleScreen'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('ManualAddScheduleScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows step indicator "3 of 3"', () => {
    render(<ManualAddScheduleScreen />, { wrapper: createWrapper() })
    expect(screen.getByText('3 of 3')).toBeTruthy()
  })

  it('renders title "Schedule"', () => {
    render(<ManualAddScheduleScreen />, { wrapper: createWrapper() })
    expect(screen.getByText('Schedule')).toBeTruthy()
  })

  it('renders watering frequency picker', () => {
    render(<ManualAddScheduleScreen />, { wrapper: createWrapper() })
    expect(screen.getByText('Watering Schedule')).toBeTruthy()
  })

  it('renders fertilizing frequency picker', () => {
    render(<ManualAddScheduleScreen />, { wrapper: createWrapper() })
    expect(screen.getByText('Fertilizing Schedule')).toBeTruthy()
  })

  it('renders care reminders toggle', () => {
    render(<ManualAddScheduleScreen />, { wrapper: createWrapper() })
    expect(screen.getByText('Care Reminders')).toBeTruthy()
  })

  it('renders notes input', () => {
    render(<ManualAddScheduleScreen />, { wrapper: createWrapper() })
    expect(screen.getByText('Notes')).toBeTruthy()
  })

  it('renders Finish button', () => {
    render(<ManualAddScheduleScreen />, { wrapper: createWrapper() })
    expect(screen.getByText('Finish')).toBeTruthy()
  })

  it('renders Back button', () => {
    render(<ManualAddScheduleScreen />, { wrapper: createWrapper() })
    expect(screen.getByText('Back')).toBeTruthy()
  })

  it('can go back to step 2', () => {
    render(<ManualAddScheduleScreen />, { wrapper: createWrapper() })
    const backButton = screen.getByText('Back')
    fireEvent.press(backButton)
    expect(mockGoBack).toHaveBeenCalled()
  })

  it('creates plant on finish', async () => {
    render(<ManualAddScheduleScreen />, { wrapper: createWrapper() })
    const finishButton = screen.getByText('Finish')
    fireEvent.press(finishButton)

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalled()
    })
  })
})
