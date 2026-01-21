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
      plantId: 'plant-123',
    },
  }),
}))

// Mock expo-image-picker
vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn().mockResolvedValue({ canceled: true }),
}))

import { EditPlantScreen } from '../EditPlantScreen'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('EditPlantScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading while fetching', () => {
    render(<EditPlantScreen />, { wrapper: createWrapper() })
    // Should show loading indicator initially
  })

  it('renders Cancel and Save buttons', async () => {
    render(<EditPlantScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeTruthy()
      expect(screen.getByText('Save')).toBeTruthy()
    })
  })

  it('renders Edit Plant title', async () => {
    render(<EditPlantScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Edit Plant')).toBeTruthy()
    })
  })

  it('goes back on Cancel', async () => {
    render(<EditPlantScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      const cancelButton = screen.getByText('Cancel')
      fireEvent.press(cancelButton)
      expect(mockGoBack).toHaveBeenCalled()
    })
  })

  it('renders photo change option', async () => {
    render(<EditPlantScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Change Photo')).toBeTruthy()
    })
  })

  it('renders name input', async () => {
    render(<EditPlantScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeTruthy()
    })
  })

  it('renders category picker', async () => {
    render(<EditPlantScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Category')).toBeTruthy()
    })
  })

  it('renders description field', async () => {
    render(<EditPlantScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Description')).toBeTruthy()
    })
  })

  it('renders care needs sliders', async () => {
    render(<EditPlantScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Watering')).toBeTruthy()
      expect(screen.getByText('Light')).toBeTruthy()
      expect(screen.getByText('Humidity')).toBeTruthy()
    })
  })

  it('renders pet safe toggle', async () => {
    render(<EditPlantScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Pet Safe')).toBeTruthy()
    })
  })

  it('renders delete button', async () => {
    render(<EditPlantScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Delete Plant')).toBeTruthy()
    })
  })

  it('shows confirmation modal on delete press', async () => {
    render(<EditPlantScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      const deleteButton = screen.getByText('Delete Plant')
      fireEvent.press(deleteButton)
    })
    await waitFor(() => {
      expect(screen.getByText('Keep Plant')).toBeTruthy()
    })
  })
})
