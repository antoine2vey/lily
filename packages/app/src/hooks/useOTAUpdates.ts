import * as Updates from 'expo-updates'
import { useEffect } from 'react'
import { AppState } from 'react-native'

/**
 * Checks for OTA updates on mount and whenever the app returns
 * to the foreground. If an update is available it is fetched and
 * applied immediately via a reload.
 */
export function useOTAUpdates() {
  useEffect(() => {
    // Skip in dev client / Expo Go
    if (__DEV__) return

    const checkAndApply = async () => {
      try {
        const result = await Updates.checkForUpdateAsync()
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync()
          await Updates.reloadAsync()
        }
      } catch {
        // Silently ignore — network errors, dev builds, etc.
      }
    }

    // Check on mount (cold start)
    checkAndApply()

    // Check when app comes back to foreground
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkAndApply()
      }
    })

    return () => subscription.remove()
  }, [])
}
