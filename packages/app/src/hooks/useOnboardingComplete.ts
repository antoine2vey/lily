import { Effect } from 'effect'
import { useEffect, useState } from 'react'
import {
  getItem,
  ONBOARDING_KEYS,
  removeItem,
  setItem,
} from '@/hooks/onboarding-storage'

export function useOnboardingComplete() {
  const [isComplete, setIsComplete] = useState<boolean | null>(null)
  const [currentStep, setCurrentStep] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Effect.runPromise(
      Effect.all([
        getItem(ONBOARDING_KEYS.complete),
        getItem(ONBOARDING_KEYS.step),
      ]).pipe(
        Effect.tap(([value, step]) =>
          Effect.sync(() => {
            setIsComplete(value === 'true')
            setCurrentStep(step ? Number(step) : 0)
          })
        ),
        Effect.catchTag('OnboardingStorageError', () =>
          Effect.sync(() => setIsComplete(false))
        ),
        Effect.tap(() => Effect.sync(() => setIsLoading(false)))
      )
    )
  }, [])

  const completeOnboarding = () =>
    Effect.runPromise(
      setItem(ONBOARDING_KEYS.complete, 'true').pipe(
        Effect.tap(() => Effect.sync(() => setIsComplete(true))),
        Effect.catchTag('OnboardingStorageError', () => Effect.void)
      )
    )

  const resetOnboarding = () =>
    Effect.runPromise(
      removeItem(ONBOARDING_KEYS.complete).pipe(
        Effect.tap(() => Effect.sync(() => setIsComplete(false))),
        Effect.catchTag('OnboardingStorageError', () => Effect.void)
      )
    )

  return {
    isComplete,
    isLoading,
    currentStep,
    completeOnboarding,
    resetOnboarding,
  }
}
