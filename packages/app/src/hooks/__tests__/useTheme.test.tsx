import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type React from 'react'
import { ThemeProvider } from 'src/contexts/ThemeContext'
import { useTheme } from '../useTheme'

// Unmock ThemeContext for this test file since we're testing the actual implementation
jest.unmock('src/contexts/ThemeContext')

// Wrapper that provides ThemeProvider
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
)

// AsyncStorage is already mocked in expo-modules

describe('useTheme', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
    ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)
  })

  it('returns default theme as system', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.theme).toBe('system')
  })

  it('loads theme from storage', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('dark')

    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.theme).toBe('dark')
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('app-theme')
  })

  it('provides setTheme function', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(typeof result.current.setTheme).toBe('function')
  })

  it('updates theme when setTheme is called', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.setTheme('dark')
    })

    expect(result.current.theme).toBe('dark')
  })

  it('persists theme to storage', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.setTheme('light')
    })

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('app-theme', 'light')
  })

  it('provides loading state initially then resolves', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    // Wait for async to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('ignores invalid stored theme values', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid')

    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Should fall back to system
    expect(result.current.theme).toBe('system')
  })

  it('handles storage errors gracefully', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockRejectedValue(
      new Error('Storage error')
    )

    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Should fall back to system
    expect(result.current.theme).toBe('system')
  })

  it('accepts all valid theme values', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const validThemes: ('light' | 'dark' | 'system')[] = [
      'light',
      'dark',
      'system',
    ]

    for (const theme of validThemes) {
      await act(async () => {
        await result.current.setTheme(theme)
      })
      expect(result.current.theme).toBe(theme)
    }
  })
})
