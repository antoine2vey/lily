import AsyncStorage from '@react-native-async-storage/async-storage'
import { Data, Effect, Schema } from 'effect'

export const ONBOARDING_KEYS = {
  complete: '@lily/onboarding_complete',
  step: '@lily/onboarding_step',
  data: '@lily/onboarding_data',
  welcome: '@lily/welcome_seen',
} as const

export class OnboardingStorageError extends Data.TaggedError(
  'OnboardingStorageError'
)<{ message: string }> {}

export const getItem = (key: string) =>
  Effect.tryPromise({
    try: () => AsyncStorage.getItem(key),
    catch: () =>
      new OnboardingStorageError({ message: `Failed to get ${key}` }),
  })

export const setItem = (key: string, value: string) =>
  Effect.tryPromise({
    try: () => AsyncStorage.setItem(key, value),
    catch: () =>
      new OnboardingStorageError({ message: `Failed to set ${key}` }),
  })

export const removeItem = (key: string) =>
  Effect.tryPromise({
    try: () => AsyncStorage.removeItem(key),
    catch: () =>
      new OnboardingStorageError({ message: `Failed to remove ${key}` }),
  })

export const multiRemove = (keys: string[]) =>
  Effect.tryPromise({
    try: () => AsyncStorage.multiRemove(keys),
    catch: () =>
      new OnboardingStorageError({
        message: 'Failed to remove onboarding keys',
      }),
  })

/**
 * Mark onboarding as complete and clean up step/data keys.
 */
export const completeOnboarding = Effect.all([
  setItem(ONBOARDING_KEYS.complete, 'true'),
  multiRemove([ONBOARDING_KEYS.step, ONBOARDING_KEYS.data]),
]).pipe(Effect.catchTag('OnboardingStorageError', () => Effect.void))

const OnboardingDataJson = Schema.parseJson(
  Schema.Record({ key: Schema.String, value: Schema.Unknown })
)
const decodeOnboardingData = Schema.decodeUnknownSync(OnboardingDataJson)
const encodeOnboardingData = Schema.encodeSync(OnboardingDataJson)

/**
 * Advance onboarding from an external screen (e.g., scanner).
 * Merges new data with existing onboarding data in AsyncStorage.
 */
export const advanceFromExternal = (
  step: number,
  newData: Record<string, unknown>
) =>
  Effect.gen(function* () {
    const existingRaw = yield* getItem(ONBOARDING_KEYS.data)
    const existing = existingRaw ? decodeOnboardingData(existingRaw) : {}
    const merged = { ...existing, ...newData }
    yield* setItem(ONBOARDING_KEYS.step, String(step))
    yield* setItem(ONBOARDING_KEYS.data, encodeOnboardingData(merged))
  }).pipe(Effect.catchTag('OnboardingStorageError', () => Effect.void))
