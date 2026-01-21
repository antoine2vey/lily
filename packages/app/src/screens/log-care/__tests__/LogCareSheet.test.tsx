import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'

// Mock expo-image-picker
vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn().mockResolvedValue({ canceled: true }),
}))

// Mock DateTimePicker
vi.mock('@react-native-community/datetimepicker', () => ({
  default: () => null,
}))

import { LogCareSheet } from '../LogCareSheet'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('LogCareSheet', () => {
  const defaultProps = {
    visible: true,
    onClose: vi.fn(),
  }

  it('renders when visible', () => {
    render(<LogCareSheet {...defaultProps} />, { wrapper: createWrapper() })
    expect(screen.getByText('Log Care')).toBeTruthy()
  })

  it('does not render when not visible', () => {
    render(<LogCareSheet {...defaultProps} visible={false} />, {
      wrapper: createWrapper(),
    })
    expect(screen.queryByText('Log Care')).toBeNull()
  })

  it('has plant selector field', () => {
    render(<LogCareSheet {...defaultProps} />, { wrapper: createWrapper() })
    expect(screen.getByText('Plants')).toBeTruthy()
  })

  it('has care type chips', () => {
    render(<LogCareSheet {...defaultProps} />, { wrapper: createWrapper() })
    expect(screen.getByText('Care Type')).toBeTruthy()
  })

  it('has date field', () => {
    render(<LogCareSheet {...defaultProps} />, { wrapper: createWrapper() })
    expect(screen.getByText('Date')).toBeTruthy()
  })

  it('has time field', () => {
    render(<LogCareSheet {...defaultProps} />, { wrapper: createWrapper() })
    expect(screen.getByText('Time')).toBeTruthy()
  })

  it('has notes field', () => {
    render(<LogCareSheet {...defaultProps} />, { wrapper: createWrapper() })
    expect(screen.getByText('Notes (optional)')).toBeTruthy()
  })

  it('has photo field', () => {
    render(<LogCareSheet {...defaultProps} />, { wrapper: createWrapper() })
    expect(screen.getByText('Photo (optional)')).toBeTruthy()
  })

  it('has save button', () => {
    render(<LogCareSheet {...defaultProps} />, { wrapper: createWrapper() })
    expect(screen.getByText('Save Log')).toBeTruthy()
  })

  it('renders care type options', () => {
    render(<LogCareSheet {...defaultProps} />, { wrapper: createWrapper() })
    expect(screen.getByText('Water')).toBeTruthy()
    expect(screen.getByText('Fertilize')).toBeTruthy()
    expect(screen.getByText('Prune')).toBeTruthy()
  })
})
