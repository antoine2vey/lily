import { renderQueryHook } from 'src/__tests__/utils/query-helpers'
import {
  useRegisterDeviceToken,
  useUnregisterDeviceToken,
} from '../useDeviceToken'

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

// Mock notifications utils
jest.mock('@/utils/notifications', () => ({
  getExpoPushToken: jest.fn(),
  getPlatform: jest.fn(() => 'ios'),
  getDeviceTimezone: jest.fn(() => 'America/New_York'),
}))

// Mock the client
jest.mock('@/utils/client', () => ({
  useEffectMutation: jest.fn(() => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
  })),
}))

describe('useRegisterDeviceToken', () => {
  it('returns mutation object with register function', () => {
    const { result } = renderQueryHook(() => useRegisterDeviceToken())

    expect(result.current).toBeDefined()
    expect(typeof result.current.register).toBe('function')
  })

  it('has isPending state', () => {
    const { result } = renderQueryHook(() => useRegisterDeviceToken())

    expect(result.current.isPending).toBe(false)
  })
})

describe('useUnregisterDeviceToken', () => {
  it('returns mutation object with unregister function', () => {
    const { result } = renderQueryHook(() => useUnregisterDeviceToken())

    expect(result.current).toBeDefined()
    expect(typeof result.current.unregister).toBe('function')
  })

  it('has isPending state', () => {
    const { result } = renderQueryHook(() => useUnregisterDeviceToken())

    expect(result.current.isPending).toBe(false)
  })
})
