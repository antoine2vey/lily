import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useSkipWaitingPreference } from '../useSkipWaitingPreference'

const STORAGE_KEY = '@lily/care_skip_waiting'

// AsyncStorage is mocked globally via the expo-modules preset.

describe('useSkipWaitingPreference', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
    ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)
  })

  it('defaults to false when nothing is stored', async () => {
    const { result } = renderHook(() => useSkipWaitingPreference())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.skipWaiting).toBe(false)
  })

  it('loads a stored "true" preference', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('true')

    const { result } = renderHook(() => useSkipWaitingPreference())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.skipWaiting).toBe(true)
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('treats any non-"true" stored value as false', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('garbage')

    const { result } = renderHook(() => useSkipWaitingPreference())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.skipWaiting).toBe(false)
  })

  it('persists the preference when set', async () => {
    const { result } = renderHook(() => useSkipWaitingPreference())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.setSkipWaiting(true)
    })

    expect(result.current.skipWaiting).toBe(true)
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'true')
  })

  it('falls back to false on a read error', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockRejectedValue(
      new Error('Storage error')
    )

    const { result } = renderHook(() => useSkipWaitingPreference())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.skipWaiting).toBe(false)
  })
})
