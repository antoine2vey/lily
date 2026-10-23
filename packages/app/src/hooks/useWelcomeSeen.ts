import { Effect } from 'effect'
import { useEffect, useState } from 'react'
import { getItem, ONBOARDING_KEYS, setItem } from '@/hooks/onboarding-storage'

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

  return { hasSeen, isLoading, markWelcomeSeen }
}

export type SignedOutRoute = '/(auth)/welcome' | '/(auth)/login'

/**
 * Where a signed-out user lands. Never `/`: groups are not part of URLs, so
 * `/` also matches the Home tab and a logout from inside the app stayed there.
 */
export const signedOutRoute = (hasSeenWelcome: boolean): SignedOutRoute =>
  hasSeenWelcome ? '/(auth)/login' : '/(auth)/welcome'

/** Reads the welcome flag at call time, for redirects outside the hook. */
export const readSignedOutRoute = getItem(ONBOARDING_KEYS.welcome).pipe(
  Effect.map((value) => signedOutRoute(value === 'true')),
  Effect.catchTag('OnboardingStorageError', () =>
    Effect.succeed(signedOutRoute(false))
  )
)
