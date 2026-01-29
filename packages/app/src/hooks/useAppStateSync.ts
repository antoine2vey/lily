import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import * as RevenueCatService from 'src/services/revenuecat'
import { useSubscriptionSync } from './useSubscriptionSync'

const SYNC_THROTTLE_MS = 30 * 1000 // 30 seconds

export function useAppStateSync(isAuthenticated: boolean) {
  const { syncSubscription } = useSubscriptionSync()
  const lastSyncRef = useRef<number>(0)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    if (!isAuthenticated) return

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      // Detect background → foreground transition
      const isComingToForeground =
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'

      if (isComingToForeground) {
        const now = Date.now()
        if (now - lastSyncRef.current >= SYNC_THROTTLE_MS) {
          lastSyncRef.current = now
          // Wake RevenueCat SDK (fetches latest from cache/network)
          await RevenueCatService.getCustomerInfo()
          // Invalidate subscription query to refresh UI
          syncSubscription()
        }
      }

      appStateRef.current = nextAppState
    }

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    )
    return () => subscription.remove()
  }, [isAuthenticated, syncSubscription])
}
