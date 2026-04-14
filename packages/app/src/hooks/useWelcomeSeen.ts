import { Effect } from 'effect'
import { useEffect, useState } from 'react'
import {
  getItem,
  ONBOARDING_KEYS,
  removeItem,
  setItem,
} from '@/hooks/onboarding-storage'

export function useWelcomeSeen() {
  const [hasSeen, setHasSeen] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Effect.runPromise(
      getItem(ONBOARDING_KEYS.welcome).pipe(
        Effect.tap((value) => Effect.sync(() => setHasSeen(value === 'true'))),
        Effect.catchTag('OnboardingStorageError', () =>
          Effect.sync(() => setHasSeen(false))
        ),
        Effect.tap(() => Effect.sync(() => setIsLoading(false)))
      )
    )
  }, [])

  const markWelcomeSeen = () =>
    Effect.runPromise(
      setItem(ONBOARDING_KEYS.welcome, 'true').pipe(
        Effect.tap(() => Effect.sync(() => setHasSeen(true))),
        Effect.catchTag('OnboardingStorageError', () => Effect.void)
      )
    )

  const resetWelcome = () =>
    Effect.runPromise(
      removeItem(ONBOARDING_KEYS.welcome).pipe(
        Effect.tap(() => Effect.sync(() => setHasSeen(false))),
        Effect.catchTag('OnboardingStorageError', () => Effect.void)
      )
    )

  return { hasSeen, isLoading, markWelcomeSeen, resetWelcome }
}
