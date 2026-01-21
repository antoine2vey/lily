import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'

// Mock navigation
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: vi.fn(),
  }),
}))

// Mock Linking
vi.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: vi.fn(),
}))

// Mock Alert
vi.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: vi.fn(),
}))

import { PrivacySettingsScreen } from '../PrivacySettingsScreen'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('PrivacySettingsScreen', () => {
  it('renders header with title', async () => {
    render(<PrivacySettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Privacy & Data')).toBeTruthy()
    })
  })

  it('renders description text', async () => {
    render(<PrivacySettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(
        screen.getByText(
          'Manage how your data is used to improve your plant care journey.'
        )
      ).toBeTruthy()
    })
  })

  it('renders Visibility & Personalization section', async () => {
    render(<PrivacySettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Visibility & Personalization')).toBeTruthy()
    })
  })

  it('renders Public Profile toggle', async () => {
    render(<PrivacySettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Public Profile')).toBeTruthy()
    })
  })

  it('renders Share Growth Data toggle', async () => {
    render(<PrivacySettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Share Growth Data')).toBeTruthy()
    })
  })

  it('renders Personalized Tips toggle', async () => {
    render(<PrivacySettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Personalized Tips')).toBeTruthy()
    })
  })

  it('renders Legal & Info section', async () => {
    render(<PrivacySettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Legal & Info')).toBeTruthy()
    })
  })

  it('renders Privacy Policy link', async () => {
    render(<PrivacySettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Privacy Policy')).toBeTruthy()
    })
  })

  it('renders Terms of Service link', async () => {
    render(<PrivacySettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Terms of Service')).toBeTruthy()
    })
  })

  it('renders Your Data section', async () => {
    render(<PrivacySettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Your Data')).toBeTruthy()
    })
  })

  it('renders Export My Data button', async () => {
    render(<PrivacySettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Export My Data')).toBeTruthy()
    })
  })

  it('renders Request Data Deletion link', async () => {
    render(<PrivacySettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Request Data Deletion')).toBeTruthy()
    })
  })
})
