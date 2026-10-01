import { Effect, Schema } from 'effect'
import { useCallback, useEffect, useState } from 'react'
import {
  completeOnboarding as completeOnboardingStorage,
  getItem,
  ONBOARDING_KEYS,
  setItem,
} from '@/hooks/onboarding-storage'

export type ExperienceLevel = 'beginner' | 'intermediate' | 'expert'
export type TimeOfDay = 'morning' | 'afternoon' | 'evening'

export interface OnboardingData {
  experienceLevel?: ExperienceLevel
  plantName?: string
  plantDays?: number
  notificationsEnabled?: boolean
  weatherEnabled?: boolean
  latitude?: number
  longitude?: number
  preferredTime?: TimeOfDay
  roomsCreated?: number
}

const TOTAL_STEPS = 7

const OnboardingDataSchema = Schema.Struct({
  experienceLevel: Schema.optionalKey(
    Schema.Literals(['beginner', 'intermediate', 'expert'])
  ),
  plantName: Schema.optionalKey(Schema.String),
  plantDays: Schema.optionalKey(Schema.Number),
  notificationsEnabled: Schema.optionalKey(Schema.Boolean),
  weatherEnabled: Schema.optionalKey(Schema.Boolean),
  latitude: Schema.optionalKey(Schema.Number),
  longitude: Schema.optionalKey(Schema.Number),
  preferredTime: Schema.optionalKey(
    Schema.Literals(['morning', 'afternoon', 'evening'])
  ),
  roomsCreated: Schema.optionalKey(Schema.Number),
}) satisfies Schema.Schema<OnboardingData>
const OnboardingDataJson = Schema.fromJsonString(OnboardingDataSchema)
const decodeOnboardingData = Schema.decodeUnknownSync(OnboardingDataJson)
const encodeOnboardingData = Schema.encodeSync(OnboardingDataJson)

export function useOnboardingFlow() {
  const [currentStep, setCurrentStep] = useState(0)
  const [data, setData] = useState<OnboardingData>({})
  const [isLoading, setIsLoading] = useState(true)

  // Restore step + data from AsyncStorage on mount
  useEffect(() => {
    Effect.runPromise(
      Effect.gen(function* () {
        const [stepStr, dataStr] = yield* Effect.all([
          getItem(ONBOARDING_KEYS.step),
          getItem(ONBOARDING_KEYS.data),
        ])

        const step = stepStr ? Number(stepStr) : 0
        const parsed = dataStr ? decodeOnboardingData(dataStr) : {}

        setCurrentStep(step)
        setData(parsed)
      }).pipe(
        Effect.catchTag('OnboardingStorageError', () => Effect.void),
        Effect.tap(() => Effect.sync(() => setIsLoading(false)))
      )
    )
  }, [])

  const persistStep = useCallback((step: number) => {
    Effect.runPromise(
      setItem(ONBOARDING_KEYS.step, String(step)).pipe(
        Effect.catchTag('OnboardingStorageError', () => Effect.void)
      )
    )
  }, [])

  const persistData = useCallback((newData: OnboardingData) => {
    Effect.runPromise(
      setItem(ONBOARDING_KEYS.data, encodeOnboardingData(newData)).pipe(
        Effect.catchTag('OnboardingStorageError', () => Effect.void)
      )
    )
  }, [])

  const advance = useCallback(
    (stepData?: Partial<OnboardingData>) => {
      const nextStep = currentStep + 1
      setData((prev) => {
        const merged = stepData ? { ...prev, ...stepData } : prev
        persistData(merged)
        return merged
      })
      setCurrentStep(nextStep)
      persistStep(nextStep)
    },
    [currentStep, persistStep, persistData]
  )

  const skipStep = useCallback(() => {
    const nextStep = currentStep + 1
    setCurrentStep(nextStep)
    persistStep(nextStep)
  }, [currentStep, persistStep])

  const complete = useCallback(async (currentData: OnboardingData) => {
    await Effect.runPromise(completeOnboardingStorage)
    return currentData
  }, [])

  const skipOnboarding = useCallback(async () => {
    await Effect.runPromise(completeOnboardingStorage)
  }, [])

  return {
    currentStep,
    data,
    isLoading,
    totalSteps: TOTAL_STEPS,
    advance,
    skipStep,
    complete,
    skipOnboarding,
  }
}
