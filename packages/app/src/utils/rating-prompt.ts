import { daysSince, nowAsIsoString } from '@lily/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Data, Effect } from 'effect'
import * as StoreReview from 'expo-store-review'

const POSITIVE_MOMENTS_REQUIRED = 5
const MIN_DAYS_BETWEEN_PROMPTS = 30

export const RATING_KEYS = {
  count: '@lily/rating_moment_count',
  lastPromptedAt: '@lily/rating_last_prompted_at',
} as const

export class RatingPromptError extends Data.TaggedError('RatingPromptError')<{
  message: string
  cause: unknown
}> {}

const multiGet = (keys: ReadonlyArray<string>) =>
  Effect.tryPromise({
    try: () => AsyncStorage.multiGet(keys),
    catch: (cause) =>
      new RatingPromptError({ message: 'AsyncStorage.multiGet failed', cause }),
  })

const setItem = (key: string, value: string) =>
  Effect.tryPromise({
    try: () => AsyncStorage.setItem(key, value),
    catch: (cause) =>
      new RatingPromptError({ message: `Failed to set ${key}`, cause }),
  })

const multiSet = (entries: Array<[string, string]>) =>
  Effect.tryPromise({
    try: () => AsyncStorage.multiSet(entries),
    catch: (cause) =>
      new RatingPromptError({ message: 'AsyncStorage.multiSet failed', cause }),
  })

const isStoreReviewAvailable = Effect.tryPromise({
  try: () => StoreReview.isAvailableAsync(),
  catch: (cause) =>
    new RatingPromptError({
      message: 'StoreReview.isAvailableAsync threw',
      cause,
    }),
})

const requestStoreReview = Effect.tryPromise({
  try: () => StoreReview.requestReview(),
  catch: (cause) =>
    new RatingPromptError({
      message: 'StoreReview.requestReview threw',
      cause,
    }),
})

const parseCount = (raw: string | null): number => {
  if (raw === null) return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

const cooldownElapsed = (lastIso: string | null): boolean =>
  lastIso === null || daysSince(lastIso) >= MIN_DAYS_BETWEEN_PROMPTS

/**
 * Increment the positive-moment counter and, if all gating conditions are met,
 * trigger the native App Store / Play Store rating modal. Fire-and-forget:
 * any storage or native SDK failure is swallowed so the caller is never affected.
 */
export const recordPositiveMoment: Effect.Effect<void, never> = Effect.gen(
  function* () {
    const entries = yield* multiGet([
      RATING_KEYS.count,
      RATING_KEYS.lastPromptedAt,
    ])

    const current = parseCount(entries[0]?.[1] ?? null)
    const elapsed = cooldownElapsed(entries[1]?.[1] ?? null)

    // Already past threshold but still in cooldown: don't grow the counter unboundedly.
    if (current >= POSITIVE_MOMENTS_REQUIRED && !elapsed) return

    const next = current + 1
    yield* setItem(RATING_KEYS.count, String(next))

    if (next < POSITIVE_MOMENTS_REQUIRED) return
    if (!elapsed) return

    const available = yield* isStoreReviewAvailable
    if (!available) return

    yield* requestStoreReview
    yield* multiSet([
      [RATING_KEYS.count, '0'],
      [RATING_KEYS.lastPromptedAt, nowAsIsoString()],
    ])
  }
).pipe(Effect.catchTag('RatingPromptError', () => Effect.void))
