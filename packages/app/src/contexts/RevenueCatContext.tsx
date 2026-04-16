import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import type {
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases'
import { useSubscriptionSync } from '@/hooks/useSubscriptionSync'
import * as RevenueCatService from '@/services/revenuecat'

interface RevenueCatContextValue {
  offerings: PurchasesOfferings | null
  isLoading: boolean
  purchase: (pkg: PurchasesPackage) => Promise<void>
  restore: () => Promise<void>
  syncSubscription: () => void
}

const RevenueCatContext = createContext<RevenueCatContextValue | null>(null)

export function useRevenueCat(): RevenueCatContextValue {
  const context = useContext(RevenueCatContext)
  if (!context) {
    throw new Error('useRevenueCat must be used within a RevenueCatProvider')
  }
  return context
}

interface RevenueCatProviderProps {
  children: ReactNode
}

export function RevenueCatProvider({ children }: RevenueCatProviderProps) {
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { syncSubscription } = useSubscriptionSync()

  useEffect(() => {
    const initAndLoadOfferings = async () => {
      try {
        // Initialize RevenueCat SDK only if not already initialized
        if (!RevenueCatService.isEnabled()) {
          RevenueCatService.initialize()
        }

        // Then load offerings
        const result = await RevenueCatService.getOfferings()
        console.log('[RevenueCat] Offerings loaded:', result)
        setOfferings(result)
      } catch (error) {
        console.error('Failed to load offerings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initAndLoadOfferings()
  }, [])

  const purchase = useCallback(async (pkg: PurchasesPackage) => {
    await RevenueCatService.purchase(pkg)
  }, [])

  const restore = useCallback(async () => {
    await RevenueCatService.restorePurchases()
  }, [])

  return (
    <RevenueCatContext.Provider
      value={{
        offerings,
        isLoading,
        purchase,
        restore,
        syncSubscription,
      }}
    >
      {children}
    </RevenueCatContext.Provider>
  )
}
