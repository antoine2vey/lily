import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'

// Mock navigation
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: vi.fn(),
  }),
}))

// Mock AsyncStorage
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock Linking
vi.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: vi.fn(),
}))

import { SettingsScreen } from '../SettingsScreen'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('SettingsScreen', () => {
  it('renders header with title', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeTruthy()
    })
  })

  it('renders Account section', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Account')).toBeTruthy()
    })
  })

  it('renders Email row', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Email')).toBeTruthy()
    })
  })

  it('renders Password row', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Password')).toBeTruthy()
    })
  })

  it('renders Subscription row', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Subscription')).toBeTruthy()
    })
  })

  it('renders Appearance section', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Appearance')).toBeTruthy()
    })
  })

  it('renders Theme row', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Theme')).toBeTruthy()
    })
  })

  it('renders Notifications section', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeTruthy()
    })
  })

  it('renders Privacy section', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Privacy')).toBeTruthy()
    })
  })

  it('renders Support section', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Support')).toBeTruthy()
    })
  })

  it('renders Help Center row', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Help Center')).toBeTruthy()
    })
  })

  it('renders Contact Us row', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Contact Us')).toBeTruthy()
    })
  })

  it('renders About Lily row', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('About Lily')).toBeTruthy()
    })
  })

  it('renders Delete Account row', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Delete Account')).toBeTruthy()
    })
  })

  it('renders version number', async () => {
    render(<SettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Version 1.0.0')).toBeTruthy()
    })
  })
})
