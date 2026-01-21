import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'

const ONBOARDING_COMPLETE_KEY = '@lily/onboarding_complete'

export function useOnboardingComplete() {
  const [isComplete, setIsComplete] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)
        setIsComplete(value === 'true')
      } catch {
        setIsComplete(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkOnboardingStatus()
  }, [])

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true')
      setIsComplete(true)
    } catch {
      // Silently fail - user will see onboarding again next time
    }
  }

  const resetOnboarding = async () => {
    try {
      await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY)
      setIsComplete(false)
    } catch {
      // Silently fail
    }
  }

  return {
    isComplete,
    isLoading,
    completeOnboarding,
    resetOnboarding,
  }
}
