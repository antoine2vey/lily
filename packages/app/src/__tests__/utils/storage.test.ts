import { Effect, Exit, Option } from 'effect'
import * as SecureStore from 'expo-secure-store'
import {
  clearAuthStorage,
  getStoredAccessToken,
  getStoredUserEmail,
  removeStoredAccessToken,
  removeStoredRefreshToken,
  removeStoredUserEmail,
  storeAccessToken,
  storeRefreshToken,
  storeUserEmail,
} from 'src/utils/storage'

// The expo-secure-store is mocked in the test setup
const mockGetItemAsync = SecureStore.getItemAsync as jest.MockedFunction<
  typeof SecureStore.getItemAsync
>
const mockSetItemAsync = SecureStore.setItemAsync as jest.MockedFunction<
  typeof SecureStore.setItemAsync
>
const mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.MockedFunction<
  typeof SecureStore.deleteItemAsync
>

describe('Storage Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('storeAccessToken', () => {
    it('should store access token successfully', async () => {
      mockSetItemAsync.mockResolvedValueOnce(undefined)

      const result = await Effect.runPromiseExit(
        storeAccessToken('test-access-token')
      )

      expect(Exit.isSuccess(result)).toBe(true)
      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'lily_access_token',
        'test-access-token'
      )
    })

    it('should fail when SecureStore throws', async () => {
      mockSetItemAsync.mockRejectedValueOnce(new Error('Storage error'))

      const result = await Effect.runPromiseExit(
        storeAccessToken('test-access-token')
      )

      expect(Exit.isFailure(result)).toBe(true)
    })
  })

  describe('getStoredAccessToken', () => {
    it('should return Some when token exists', async () => {
      mockGetItemAsync.mockResolvedValueOnce('existing-token')

      const result = await Effect.runPromise(getStoredAccessToken())

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toBe('existing-token')
      }
    })

    it('should return None when token does not exist', async () => {
      mockGetItemAsync.mockResolvedValueOnce(null)

      const result = await Effect.runPromise(getStoredAccessToken())

      expect(Option.isNone(result)).toBe(true)
    })

    it('should fail when SecureStore throws', async () => {
      mockGetItemAsync.mockRejectedValueOnce(new Error('Storage error'))

      const result = await Effect.runPromiseExit(getStoredAccessToken())

      expect(Exit.isFailure(result)).toBe(true)
    })
  })

  describe('removeStoredAccessToken', () => {
    it('should remove access token successfully', async () => {
      mockDeleteItemAsync.mockResolvedValueOnce(undefined)

      const result = await Effect.runPromiseExit(removeStoredAccessToken())

      expect(Exit.isSuccess(result)).toBe(true)
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('lily_access_token')
    })

    it('should fail when SecureStore throws', async () => {
      mockDeleteItemAsync.mockRejectedValueOnce(new Error('Storage error'))

      const result = await Effect.runPromiseExit(removeStoredAccessToken())

      expect(Exit.isFailure(result)).toBe(true)
    })
  })

  describe('storeRefreshToken', () => {
    it('should store refresh token successfully', async () => {
      mockSetItemAsync.mockResolvedValueOnce(undefined)

      const result = await Effect.runPromiseExit(
        storeRefreshToken('test-refresh-token')
      )

      expect(Exit.isSuccess(result)).toBe(true)
      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'lily_refresh_token',
        'test-refresh-token'
      )
    })
  })

  describe('removeStoredRefreshToken', () => {
    it('should remove refresh token successfully', async () => {
      mockDeleteItemAsync.mockResolvedValueOnce(undefined)

      const result = await Effect.runPromiseExit(removeStoredRefreshToken())

      expect(Exit.isSuccess(result)).toBe(true)
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('lily_refresh_token')
    })
  })

  describe('storeUserEmail', () => {
    it('should store user email successfully', async () => {
      mockSetItemAsync.mockResolvedValueOnce(undefined)

      const result = await Effect.runPromiseExit(
        storeUserEmail('user@example.com')
      )

      expect(Exit.isSuccess(result)).toBe(true)
      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'lily_user_email',
        'user@example.com'
      )
    })
  })

  describe('getStoredUserEmail', () => {
    it('should return Some when email exists', async () => {
      mockGetItemAsync.mockResolvedValueOnce('user@example.com')

      const result = await Effect.runPromise(getStoredUserEmail())

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toBe('user@example.com')
      }
    })

    it('should return None when email does not exist', async () => {
      mockGetItemAsync.mockResolvedValueOnce(null)

      const result = await Effect.runPromise(getStoredUserEmail())

      expect(Option.isNone(result)).toBe(true)
    })
  })

  describe('removeStoredUserEmail', () => {
    it('should remove user email successfully', async () => {
      mockDeleteItemAsync.mockResolvedValueOnce(undefined)

      const result = await Effect.runPromiseExit(removeStoredUserEmail())

      expect(Exit.isSuccess(result)).toBe(true)
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('lily_user_email')
    })
  })

  describe('clearAuthStorage', () => {
    it('should clear all auth storage items', async () => {
      mockDeleteItemAsync.mockResolvedValue(undefined)

      const result = await Effect.runPromiseExit(clearAuthStorage())

      expect(Exit.isSuccess(result)).toBe(true)
      expect(mockDeleteItemAsync).toHaveBeenCalledTimes(3)
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('lily_access_token')
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('lily_refresh_token')
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('lily_user_email')
    })

    it('should fail if any storage operation fails', async () => {
      mockDeleteItemAsync.mockResolvedValueOnce(undefined)
      mockDeleteItemAsync.mockRejectedValueOnce(new Error('Storage error'))
      mockDeleteItemAsync.mockResolvedValueOnce(undefined)

      const result = await Effect.runPromiseExit(clearAuthStorage())

      expect(Exit.isFailure(result)).toBe(true)
    })
  })
})
