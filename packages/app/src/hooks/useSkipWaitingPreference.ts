import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'

const SKIP_WAITING_STORAGE_KEY = '@lily/care_skip_waiting'

interface SkipWaitingPreference {
  /** When true, completing an overdue/today care task skips the undo countdown. */
  skipWaiting: boolean
  /** Update the preference and persist it to device storage. */
  setSkipWaiting: (value: boolean) => Promise<void>
  /** True while the stored preference is being loaded. */
  isLoading: boolean
}

/**
 * Device-local "power user" preference for the Care screen.
 *
 * When enabled, completing an overdue/today task fires immediately instead of
 * waiting out the 5s undo countdown (`CARE_TASK_UNDO_TIMEOUT_MS`). The value is
 * persisted per-device in AsyncStorage, mirroring the theme-preference idiom in
 * `ThemeContext` (load on mount, optimistic setState + persist on change).
 */
export function useSkipWaitingPreference(): SkipWaitingPreference {
  const [skipWaiting, setSkipWaitingState] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadPreference = async () => {
      try {
        const stored = await AsyncStorage.getItem(SKIP_WAITING_STORAGE_KEY)
        if (stored === 'true') {
          setSkipWaitingState(true)
        }
      } catch {
        // Keep the default (false) on read error
      } finally {
        setIsLoading(false)
      }
    }

    loadPreference()
  }, [])

  const setSkipWaiting = useCallback(async (value: boolean) => {
    setSkipWaitingState(value)
    try {
      await AsyncStorage.setItem(SKIP_WAITING_STORAGE_KEY, String(value))
    } catch {
      // Ignore storage write errors — the in-memory state is still updated
    }
  }, [])

  return { skipWaiting, setSkipWaiting, isLoading }
}
