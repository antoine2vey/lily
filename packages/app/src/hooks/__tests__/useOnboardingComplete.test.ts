import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useOnboardingComplete } from '../useOnboardingComplete'

describe('useOnboardingComplete', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns loading state initially then resolves', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)

    const { result } = renderHook(() => useOnboardingComplete())

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('returns isComplete as false when not completed', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)

    const { result } = renderHook(() => useOnboardingComplete())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isComplete).toBe(false)
  })

  it('returns isComplete as true when completed', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('true')

    const { result } = renderHook(() => useOnboardingComplete())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isComplete).toBe(true)
  })

  it('updates isComplete when completeOnboarding called', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
    ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)

    const { result } = renderHook(() => useOnboardingComplete())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.completeOnboarding()
    })

    expect(result.current.isComplete).toBe(true)
  })

  it('persists to storage when completeOnboarding called', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
    ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)

    const { result } = renderHook(() => useOnboardingComplete())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.completeOnboarding()
    })

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@lily/onboarding_complete',
      'true'
    )
  })
})
