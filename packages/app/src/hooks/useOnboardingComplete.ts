import AsyncStorage from '@react-native-async-storage/async-storage'
import { Data, Effect } from 'effect'
import { useEffect, useState } from 'react'

const ONBOARDING_COMPLETE_KEY = '@lily/onboarding_complete'

class OnboardingStorageError extends Data.TaggedError(
  'OnboardingStorageError'
)<{ message: string }> {}

const getOnboardingStatus = Effect.tryPromise({
  try: () => AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY),
  catch: () =>
    new OnboardingStorageError({
      message: 'Failed to get onboarding status',
    }),
})

const setOnboardingStatus = (value: string) =>
  Effect.tryPromise({
    try: () => AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, value),
    catch: () =>
      new OnboardingStorageError({
        message: 'Failed to set onboarding status',
      }),
  })

const removeOnboardingStatus = Effect.tryPromise({
  try: () => AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY),
  catch: () =>
    new OnboardingStorageError({
      message: 'Failed to remove onboarding status',
    }),
})

export function useOnboardingComplete() {
  const [isComplete, setIsComplete] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Effect.runPromise(
      getOnboardingStatus.pipe(
        Effect.tap((value) =>
          Effect.sync(() => setIsComplete(value === 'true'))
        ),
        Effect.catchAll(() => Effect.sync(() => setIsComplete(false))),
        Effect.tap(() => Effect.sync(() => setIsLoading(false)))
      )
    )
  }, [])

  const completeOnboarding = () =>
    Effect.runPromise(
      setOnboardingStatus('true').pipe(
        Effect.tap(() => Effect.sync(() => setIsComplete(true))),
        Effect.catchAll(() => Effect.void)
      )
    )

  const resetOnboarding = () =>
    Effect.runPromise(
      removeOnboardingStatus.pipe(
        Effect.tap(() => Effect.sync(() => setIsComplete(false))),
        Effect.catchAll(() => Effect.void)
      )
    )

  return {
    isComplete,
    isLoading,
    completeOnboarding,
    resetOnboarding,
  }
}
