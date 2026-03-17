import { useQueryClient } from '@tanstack/react-query'
import { Data, Effect, Either, Option } from 'effect'
import * as SecureStore from 'expo-secure-store'
import { useEffectMutation } from 'src/utils/client'
import {
  getDeviceTimezone,
  getExpoPushToken,
  getPlatform,
} from 'src/utils/notifications'

const DEVICE_TOKEN_ID_KEY = 'lily_device_token_id'

class DeviceTokenStorageError extends Data.TaggedError(
  'DeviceTokenStorageError'
)<{ message: string }> {}

// Storage helpers for device token ID
const storeDeviceTokenId = (
  tokenId: string
): Effect.Effect<void, DeviceTokenStorageError> =>
  Effect.tryPromise({
    try: () => SecureStore.setItemAsync(DEVICE_TOKEN_ID_KEY, tokenId),
    catch: (error) =>
      new DeviceTokenStorageError({
        message: `Failed to store device token ID: ${String(error)}`,
      }),
  })

const getStoredDeviceTokenId = (): Effect.Effect<
  Option.Option<string>,
  DeviceTokenStorageError
> =>
  Effect.tryPromise({
    try: async () => {
      const tokenId = await SecureStore.getItemAsync(DEVICE_TOKEN_ID_KEY)
      return Option.fromNullable(tokenId)
    },
    catch: (error) =>
      new DeviceTokenStorageError({
        message: `Failed to get device token ID: ${String(error)}`,
      }),
  })

const removeStoredDeviceTokenId = (): Effect.Effect<
  void,
  DeviceTokenStorageError
> =>
  Effect.tryPromise({
    try: () => SecureStore.deleteItemAsync(DEVICE_TOKEN_ID_KEY),
    catch: (error) =>
      new DeviceTokenStorageError({
        message: `Failed to remove device token ID: ${String(error)}`,
      }),
  })

/**
 * Hook to register a device token for push notifications
 */
export function useRegisterDeviceToken() {
  const queryClient = useQueryClient()

  const mutation = useEffectMutation('deviceTokens', 'registerDeviceToken', {
    onSuccess: async (apiResult) => {
      // Only store if the result is successful
      if (Either.isRight(apiResult)) {
        await Effect.runPromise(storeDeviceTokenId(apiResult.right.id))
        queryClient.invalidateQueries({ queryKey: ['deviceTokens'] })
      }
    },
  })

  /**
   * Register the device for push notifications
   * Returns true if successful, false otherwise
   */
  const register = async (): Promise<boolean> => {
    const pushToken = await getExpoPushToken()
    if (!pushToken) {
      return false
    }

    try {
      await mutation.mutateAsync({
        payload: {
          token: pushToken,
          platform: getPlatform(),
        },
      })
      return true
    } catch (error) {
      console.error('Failed to register device token:', error)
      return false
    }
  }

  return {
    ...mutation,
    register,
  }
}

/**
 * Hook to unregister a device token
 */
export function useUnregisterDeviceToken() {
  const queryClient = useQueryClient()

  const mutation = useEffectMutation('deviceTokens', 'unregisterDeviceToken', {
    onSuccess: async () => {
      // Remove the stored token ID
      await Effect.runPromise(removeStoredDeviceTokenId())
      queryClient.invalidateQueries({ queryKey: ['deviceTokens'] })
    },
  })

  /**
   * Unregister the device from push notifications
   * Returns true if successful, false otherwise
   */
  const unregister = async (): Promise<boolean> => {
    const tokenIdOption = await Effect.runPromise(getStoredDeviceTokenId())

    return Option.match(tokenIdOption, {
      onNone: () => {
        // No token stored, nothing to unregister
        return true
      },
      onSome: async (tokenId) => {
        try {
          await mutation.mutateAsync({
            path: { tokenId },
          })
          return true
        } catch (error) {
          console.error('Failed to unregister device token:', error)
          return false
        }
      },
    })
  }

  return {
    ...mutation,
    unregister,
  }
}

/**
 * Get the stored device token ID
 */
export async function getDeviceTokenId(): Promise<string | null> {
  const tokenIdOption = await Effect.runPromise(getStoredDeviceTokenId())
  return Option.getOrNull(tokenIdOption)
}

/**
 * Clear the stored device token ID (for logout)
 */
export async function clearDeviceTokenId(): Promise<void> {
  await Effect.runPromise(removeStoredDeviceTokenId())
}

// Re-export getDeviceTimezone for convenience
export { getDeviceTimezone }
